import type Database from 'better-sqlite3';
import { sanitizeCashMemoSettings } from '../../lib/cashMemoTemplates.ts';
import {
  assertJournalBalanced,
  buildReversalLines,
  generateFinancialReports,
  roundMoney,
} from '../../engine/accounting.ts';
import {
  allocatePayment,
  buildCustomerStatement,
  computeInvoiceTotals,
  computeNextRecurringDate,
  resolveInvoiceStatus,
} from '../../engine/billing.ts';
import { formatDate, formatMoney, formatNumber, todayISO } from '../../engine/format.ts';
import { computeStockOutCOGS, computeWeightedAvgStockIn, type StockLot } from '../../engine/inventory.ts';
import { formatMushakChallanNo } from '../../engine/vat.ts';
import type {
  Account,
  AlertItem,
  AuditLog,
  Branch,
  Customer,
  DocumentRecord,
  Expense,
  FinancialReportSummary,
  InventoryMethod,
  Invoice,
  InvoiceLineInput,
  JournalEntry,
  JournalLine,
  Organization,
  Payment,
  PaymentMethod,
  Product,
  ProductBranchStock,
  Purchase,
  RecurringFrequency,
  RecurringProfile,
  StatementRow,
  StockMovementRecord,
  TaxMode,
  TaxRule,
  Vendor,
} from '../../engine/types.ts';

export interface ActorContext {
  name: string;
  role: string;
}

function getAccountIdByCode(db: Database.Database, code: string): number {
  const row = db.prepare('SELECT id FROM accounts WHERE code = ?').get(code) as { id: number } | undefined;
  if (!row) throw new Error(`Account code "${code}" not found in Chart of Accounts.`);
  return row.id;
}

function paymentMethodToAccountCode(method: PaymentMethod): string {
  if (method === 'cash') return '1000';
  if (method === 'bank') return '1010';
  return '1020'; // bkash, nagad, sslcommerz, card
}

function nextSequence(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COALESCE(MAX(id), 0) as maxId FROM ${table}`).get() as { maxId: number };
  return row.maxId + 1;
}

export function writeAuditLog(
  db: Database.Database,
  actor: ActorContext,
  action: string,
  entityType: string,
  entityId: string | number,
  summary: string
): void {
  db.prepare(
    `INSERT INTO audit_logs (actor_name, actor_role, action, entity_type, entity_id, summary)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(actor.name, actor.role, action, entityType, String(entityId), summary);
}

/**
 * Posts a verified, balanced double-entry journal entry atomically.
 */
export function postJournalEntry(
  db: Database.Database,
  params: {
    entryDate: string;
    branchId: number;
    sourceType: string;
    sourceId: number | null;
    description: string;
    lines: JournalLine[];
    reversalOfId?: number | null;
    actor: ActorContext;
  }
): number {
  const balanced = assertJournalBalanced(params.lines);
  const seq = nextSequence(db, 'journal_entries');
  const year = params.entryDate.slice(0, 4) || String(new Date().getFullYear());
  const entryNumber = `JE-${year}-${String(seq).padStart(5, '0')}`;

  const info = db
    .prepare(
      `INSERT INTO journal_entries (entry_number, entry_date, branch_id, source_type, source_id, description, status, reversal_of_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?)`
    )
    .run(
      entryNumber,
      params.entryDate,
      params.branchId,
      params.sourceType,
      params.sourceId,
      params.description,
      params.reversalOfId ?? null,
      params.actor.name
    );

  const journalEntryId = Number(info.lastInsertRowid);
  const insertLine = db.prepare(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, memo)
     VALUES (?, ?, ?, ?, ?)`
  );

  for (const line of balanced.lines) {
    const accountId = line.accountId || getAccountIdByCode(db, line.accountCode);
    insertLine.run(journalEntryId, accountId, line.debit, line.credit, line.memo || '');
  }

  return journalEntryId;
}

/**
 * Immutable Ledger Reversal: marks original entry as reversed and posts balanced contra journal.
 */
export function reverseJournalEntry(
  db: Database.Database,
  journalEntryId: number,
  reason: string,
  actor: ActorContext
): { reversalJournalId: number } {
  const tx = db.transaction(() => {
    const original = db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(journalEntryId) as
      | {
          id: number;
          entry_number: string;
          branch_id: number;
          status: string;
          description: string;
        }
      | undefined;

    if (!original) {
      throw new Error('Journal entry not found.');
    }
    if (original.status === 'reversed') {
      throw new Error('Journal entry has already been reversed.');
    }

    const lines = db
      .prepare(
        `SELECT jl.account_id as accountId, a.code as accountCode, jl.debit, jl.credit, jl.memo
         FROM journal_lines jl
         INNER JOIN accounts a ON a.id = jl.account_id
         WHERE jl.journal_entry_id = ?`
      )
      .all(journalEntryId) as JournalLine[];

    const reversalLines = buildReversalLines(lines);

    db.prepare("UPDATE journal_entries SET status = 'reversed' WHERE id = ?").run(journalEntryId);

    const reversalJournalId = postJournalEntry(db, {
      entryDate: todayISO(),
      branchId: original.branch_id,
      sourceType: 'reversal',
      sourceId: original.id,
      description: `Reversal of ${original.entry_number}${reason ? `: ${reason}` : ''}`,
      lines: reversalLines,
      reversalOfId: original.id,
      actor,
    });

    writeAuditLog(
      db,
      actor,
      'JOURNAL_REVERSED',
      'journal_entry',
      original.id,
      `Reversed ${original.entry_number} via immutable contra entry #${reversalJournalId}`
    );

    return { reversalJournalId };
  });

  return tx();
}

export function getOrganization(db: Database.Database): Organization {
  const row = db.prepare('SELECT * FROM organizations WHERE id = 1').get() as Record<string, unknown>;
  let parsedCashMemo: unknown = undefined;
  if (typeof row.cash_memo_settings_json === 'string' && row.cash_memo_settings_json.trim()) {
    try {
      parsedCashMemo = JSON.parse(row.cash_memo_settings_json);
    } catch {
      parsedCashMemo = undefined;
    }
  }
  return {
    id: Number(row.id),
    name: String(row.name),
    nameBn: String(row.name_bn),
    binNumber: String(row.bin_number),
    tinNumber: String(row.tin_number),
    phone: String(row.phone),
    email: String(row.email),
    address: String(row.address),
    currency: String(row.currency),
    currencySymbol: String(row.currency_symbol),
    defaultLanguage: (row.default_language as 'bn' | 'en') || 'bn',
    inventoryMethod: (row.inventory_method as InventoryMethod) || 'weighted_avg',
    vatMode: (row.vat_mode as TaxMode) || 'exclusive',
    fiscalYearStartMonth: Number(row.fiscal_year_start_month || 7),
    invoicePrefix: String(row.invoice_prefix || 'INV'),
    mushakPrefix: String(row.mushak_prefix || 'M63'),
    proprietorName: String(row.proprietor_name || ''),
    tagline: String(row.tagline || ''),
    website: String(row.website || ''),
    businessDescription: String(row.business_description || ''),
    logoUrl: String(row.logo_url || ''),
    cashMemoSettings: sanitizeCashMemoSettings(parsedCashMemo),
    adminLockEnabled: Boolean(row.admin_password_hash || process.env.BEPARI_ADMIN_PASSCODE),
  };
}

/**
 * Core Algorithm 1: Invoice Processing
 * Invoice -> VAT -> Stock Deduction & COGS -> Receivable -> Double-entry Journal -> Mushak 6.3 Document -> Audit Trail
 */
export function createInvoiceTransaction(
  db: Database.Database,
  input: {
    branchId: number;
    customerId: number;
    issueDate: string;
    dueDate: string;
    notes?: string;
    source?: 'invoice' | 'pos' | 'recurring';
    items: InvoiceLineInput[];
    idempotencyKey?: string;
    immediatePayment?: {
      amount: number;
      method: PaymentMethod;
      gatewayProvider?: string | null;
      gatewayReference?: string | null;
    };
  },
  actor: ActorContext
): Invoice {
  if (input.idempotencyKey) {
    const existing = db
      .prepare('SELECT response_json FROM idempotency_keys WHERE key = ?')
      .get(input.idempotencyKey) as { response_json: string } | undefined;
    if (existing) {
      return JSON.parse(existing.response_json) as Invoice;
    }
  }

  const tx = db.transaction(() => {
    const org = getOrganization(db);
    const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(input.branchId) as
      | { id: number; code: string; name: string }
      | undefined;
    if (!branch) throw new Error('Selected branch does not exist.');

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(input.customerId) as
      | { id: number; name: string; company_name: string }
      | undefined;
    if (!customer) throw new Error('Selected customer does not exist.');

    const computed = computeInvoiceTotals(input.items, org.vatMode);
    const seq = nextSequence(db, 'invoices');
    const year = Number(input.issueDate.slice(0, 4)) || new Date().getFullYear();
    const invoiceNumber = `${org.invoicePrefix}-${branch.code}-${year}-${String(seq).padStart(5, '0')}`;
    const mushakChallanNo = formatMushakChallanNo(org.mushakPrefix, branch.code, seq, year);

    const status = resolveInvoiceStatus({
      grandTotal: computed.grandTotal,
      paidAmount: 0,
      dueDate: input.dueDate,
      today: todayISO(),
    });

    const invInfo = db
      .prepare(
        `INSERT INTO invoices (
          invoice_number, mushak_challan_no, branch_id, customer_id,
          issue_date, due_date, status, source,
          subtotal, discount_total, sd_total, vat_total, grand_total, paid_amount, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .run(
        invoiceNumber,
        mushakChallanNo,
        input.branchId,
        input.customerId,
        input.issueDate,
        input.dueDate,
        status,
        input.source || 'invoice',
        computed.subtotal,
        computed.discountTotal,
        computed.sdTotal,
        computed.vatTotal,
        computed.grandTotal,
        input.notes || ''
      );

    const invoiceId = Number(invInfo.lastInsertRowid);

    const insertItem = db.prepare(
      `INSERT INTO invoice_items (
        invoice_id, product_id, description, quantity, unit_price, discount_amount,
        tax_rule_id, tax_rate, sd_rate, taxable_value, sd_amount, vat_amount, line_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let totalCogs = 0;

    for (const line of computed.lines) {
      insertItem.run(
        invoiceId,
        line.productId,
        line.description,
        line.quantity,
        line.unitPrice,
        line.discountAmount,
        line.taxRuleId,
        line.taxRate,
        line.sdRate,
        line.taxableValue,
        line.sdAmount,
        line.vatAmount,
        line.lineTotal
      );

      // Inventory Engine: deduct branch stock & compute COGS
      if (line.productId) {
        const prod = db
          .prepare('SELECT id, track_inventory, cost_price FROM products WHERE id = ?')
          .get(line.productId) as { id: number; track_inventory: number; cost_price: number } | undefined;

        if (prod && prod.track_inventory) {
          const stockRow = db
            .prepare('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?')
            .get(input.branchId, prod.id) as
            | { id: number; quantity: number; avg_cost: number; fifo_lots_json: string }
            | undefined;

          const currentQty = stockRow?.quantity ?? 0;
          const currentAvgCost = stockRow?.avg_cost ?? prod.cost_price;
          const fifoLots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];

          const out = computeStockOutCOGS({
            method: org.inventoryMethod,
            currentQty,
            currentAvgCost,
            soldQty: line.quantity,
            fifoLots,
          });

          if (stockRow) {
            db.prepare(
              'UPDATE branch_stock SET quantity = ?, fifo_lots_json = ? WHERE id = ?'
            ).run(out.remainingQty, JSON.stringify(out.remainingLots ?? fifoLots), stockRow.id);
          } else {
            db.prepare(
              'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)'
            ).run(input.branchId, prod.id, out.remainingQty, currentAvgCost, '[]');
          }

          db.prepare(
            `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date)
             VALUES (?, ?, 'out', ?, ?, ?, 'invoice', ?, ?)`
          ).run(
            input.branchId,
            prod.id,
            line.quantity,
            out.effectiveUnitCost,
            out.cogsTotal,
            invoiceId,
            input.issueDate
          );

          totalCogs = roundMoney(totalCogs + out.cogsTotal);
        }
      }
    }

    // Accounting Engine: atomic Double-Entry Journal
    const journalLines: JournalLine[] = [
      {
        accountCode: '1100',
        debit: computed.grandTotal,
        credit: 0,
        memo: `Receivable: ${invoiceNumber} (${customer.name})`,
      },
      {
        accountCode: '4000',
        debit: 0,
        credit: computed.subtotal,
        memo: `Sales Revenue: ${invoiceNumber}`,
      },
    ];

    if (computed.vatTotal > 0) {
      journalLines.push({
        accountCode: '2100',
        debit: 0,
        credit: computed.vatTotal,
        memo: `Output VAT (${mushakChallanNo})`,
      });
    }
    if (computed.sdTotal > 0) {
      journalLines.push({
        accountCode: '2110',
        debit: 0,
        credit: computed.sdTotal,
        memo: `Supplementary Duty (${mushakChallanNo})`,
      });
    }
    if (totalCogs > 0) {
      journalLines.push(
        {
          accountCode: '5000',
          debit: totalCogs,
          credit: 0,
          memo: `COGS: ${invoiceNumber}`,
        },
        {
          accountCode: '1200',
          debit: 0,
          credit: totalCogs,
          memo: `Inventory Reduction: ${invoiceNumber}`,
        }
      );
    }

    const journalEntryId = postJournalEntry(db, {
      entryDate: input.issueDate,
      branchId: input.branchId,
      sourceType: input.source || 'invoice',
      sourceId: invoiceId,
      description: `Invoice ${invoiceNumber} — ${customer.name} (${mushakChallanNo})`,
      lines: journalLines,
      actor,
    });

    db.prepare('UPDATE invoices SET journal_entry_id = ? WHERE id = ?').run(journalEntryId, invoiceId);

    // Document Management Archive: Invoice + Mushak 6.3 Challan
    db.prepare(
      `INSERT INTO documents (doc_type, reference_number, entity_type, entity_id, title, party_name, amount, issued_at)
       VALUES ('invoice', ?, 'invoice', ?, ?, ?, ?, ?)`
    ).run(invoiceNumber, invoiceId, `Tax Invoice ${invoiceNumber}`, customer.name, computed.grandTotal, input.issueDate);

    db.prepare(
      `INSERT INTO documents (doc_type, reference_number, entity_type, entity_id, title, party_name, amount, issued_at)
       VALUES ('mushak_63', ?, 'invoice', ?, ?, ?, ?, ?)`
    ).run(
      mushakChallanNo,
      invoiceId,
      `Mushak 6.3 Challan ${mushakChallanNo}`,
      customer.name,
      computed.grandTotal,
      input.issueDate
    );

    writeAuditLog(
      db,
      actor,
      input.source === 'pos' ? 'POS_SALE_POSTED' : 'INVOICE_POSTED',
      'invoice',
      invoiceId,
      `Posted ${invoiceNumber} (${mushakChallanNo}) for ${customer.name}: Total ${computed.grandTotal}, VAT ${computed.vatTotal}`
    );

    // Optional immediate payment (used by POS quick checkout)
    if (input.immediatePayment && input.immediatePayment.amount > 0) {
      recordPaymentInternal(
        db,
        {
          customerId: input.customerId,
          branchId: input.branchId,
          paymentDate: input.issueDate,
          amount: input.immediatePayment.amount,
          method: input.immediatePayment.method,
          gatewayProvider: input.immediatePayment.gatewayProvider ?? null,
          gatewayReference: input.immediatePayment.gatewayReference ?? null,
          invoiceId,
          notes: `POS Counter Settlement for ${invoiceNumber}`,
        },
        actor
      );
    }

    const result = getInvoiceById(db, invoiceId)!;

    if (input.idempotencyKey) {
      db.prepare('INSERT INTO idempotency_keys (key, endpoint, response_json) VALUES (?, ?, ?)').run(
        input.idempotencyKey,
        'create_invoice',
        JSON.stringify(result)
      );
    }

    return result;
  });

  return tx();
}

function recordPaymentInternal(
  db: Database.Database,
  input: {
    customerId: number;
    branchId: number;
    paymentDate: string;
    amount: number;
    method: PaymentMethod;
    gatewayProvider?: string | null;
    gatewayReference?: string | null;
    invoiceId?: number | null;
    notes?: string;
  },
  actor: ActorContext
): Payment {
  const customer = db.prepare('SELECT id, name FROM customers WHERE id = ?').get(input.customerId) as
    | { id: number; name: string }
    | undefined;
  if (!customer) throw new Error('Customer not found.');

  const openRows = db
    .prepare(
      `SELECT id, invoice_number as invoiceNumber, issue_date as issueDate, due_date as dueDate,
              grand_total as grandTotal, paid_amount as paidAmount,
              ROUND(grand_total - paid_amount, 2) as balanceDue
       FROM invoices
       WHERE customer_id = ? AND status NOT IN ('paid', 'void', 'draft') AND ROUND(grand_total - paid_amount, 2) > 0
       ORDER BY issue_date ASC, id ASC`
    )
    .all(input.customerId) as {
    id: number;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    grandTotal: number;
    paidAmount: number;
    balanceDue: number;
  }[];

  const plan = allocatePayment(
    input.amount,
    openRows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      issueDate: r.issueDate,
      balanceDue: r.balanceDue,
    })),
    input.invoiceId
  );

  const seq = nextSequence(db, 'payments');
  const year = input.paymentDate.slice(0, 4) || String(new Date().getFullYear());
  const paymentNumber = `PAY-${year}-${String(seq).padStart(5, '0')}`;

  const payInfo = db
    .prepare(
      `INSERT INTO payments (
        payment_number, customer_id, branch_id, payment_date, amount, method,
        gateway_provider, gateway_reference, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      paymentNumber,
      input.customerId,
      input.branchId,
      input.paymentDate,
      roundMoney(input.amount),
      input.method,
      input.gatewayProvider ?? null,
      input.gatewayReference ?? null,
      input.notes || ''
    );

  const paymentId = Number(payInfo.lastInsertRowid);
  const insertAlloc = db.prepare(
    'INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES (?, ?, ?)'
  );

  for (const alloc of plan.allocations) {
    insertAlloc.run(paymentId, alloc.invoiceId, alloc.amount);
    const inv = openRows.find((r) => r.id === alloc.invoiceId)!;
    const nextPaid = roundMoney(inv.paidAmount + alloc.amount);
    const nextStatus = resolveInvoiceStatus({
      grandTotal: inv.grandTotal,
      paidAmount: nextPaid,
      dueDate: inv.dueDate,
      today: todayISO(),
    });
    db.prepare('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?').run(
      nextPaid,
      nextStatus,
      alloc.invoiceId
    );
  }

  const cashAccountCode = paymentMethodToAccountCode(input.method);
  const journalEntryId = postJournalEntry(db, {
    entryDate: input.paymentDate,
    branchId: input.branchId,
    sourceType: 'payment',
    sourceId: paymentId,
    description: `Payment ${paymentNumber} (${input.method.toUpperCase()}) from ${customer.name}`,
    lines: [
      {
        accountCode: cashAccountCode,
        debit: roundMoney(input.amount),
        credit: 0,
        memo: `Received via ${input.method}${input.gatewayReference ? ` Ref: ${input.gatewayReference}` : ''}`,
      },
      {
        accountCode: '1100',
        debit: 0,
        credit: roundMoney(input.amount),
        memo: `Settled receivable: ${customer.name}`,
      },
    ],
    actor,
  });

  db.prepare('UPDATE payments SET journal_entry_id = ? WHERE id = ?').run(journalEntryId, paymentId);

  db.prepare(
    `INSERT INTO documents (doc_type, reference_number, entity_type, entity_id, title, party_name, amount, issued_at)
     VALUES ('receipt', ?, 'payment', ?, ?, ?, ?, ?)`
  ).run(paymentNumber, paymentId, `Payment Receipt ${paymentNumber}`, customer.name, roundMoney(input.amount), input.paymentDate);

  writeAuditLog(
    db,
    actor,
    'PAYMENT_RECORDED',
    'payment',
    paymentId,
    `Recorded ${paymentNumber} (${input.method}) of ${roundMoney(input.amount)} from ${customer.name}`
  );

  return {
    id: paymentId,
    paymentNumber,
    customerId: input.customerId,
    customerName: customer.name,
    branchId: input.branchId,
    paymentDate: input.paymentDate,
    amount: roundMoney(input.amount),
    method: input.method,
    gatewayProvider: input.gatewayProvider ?? null,
    gatewayReference: input.gatewayReference ?? null,
    notes: input.notes || '',
    journalEntryId,
    allocations: plan.allocations,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Core Algorithm 3: Payment Allocation & Settlement
 */
export function recordPaymentTransaction(
  db: Database.Database,
  input: {
    customerId: number;
    branchId: number;
    paymentDate: string;
    amount: number;
    method: PaymentMethod;
    gatewayProvider?: string | null;
    gatewayReference?: string | null;
    invoiceId?: number | null;
    notes?: string;
    idempotencyKey?: string;
  },
  actor: ActorContext
): Payment {
  if (input.idempotencyKey) {
    const existing = db
      .prepare('SELECT response_json FROM idempotency_keys WHERE key = ?')
      .get(input.idempotencyKey) as { response_json: string } | undefined;
    if (existing) {
      return JSON.parse(existing.response_json) as Payment;
    }
  }

  const tx = db.transaction(() => {
    const payment = recordPaymentInternal(db, input, actor);
    if (input.idempotencyKey) {
      db.prepare('INSERT INTO idempotency_keys (key, endpoint, response_json) VALUES (?, ?, ?)').run(
        input.idempotencyKey,
        'record_payment',
        JSON.stringify(payment)
      );
    }
    return payment;
  });

  return tx();
}

/**
 * Core Algorithm 2: Purchase Processing (Mushak 6.1 Input VAT + Stock In + Weighted Avg + Journal)
 */
export function createPurchaseTransaction(
  db: Database.Database,
  input: {
    branchId: number;
    vendorId: number;
    purchaseDate: string;
    mushak61Ref?: string;
    notes?: string;
    payImmediately?: boolean;
    paymentMethod?: PaymentMethod;
    items: { productId: number; quantity: number; unitCost: number; vatRate: number }[];
  },
  actor: ActorContext
): Purchase {
  if (!input.items || input.items.length === 0) {
    throw new Error('Purchase bill requires at least one product line.');
  }

  const tx = db.transaction(() => {
    const vendor = db.prepare('SELECT id, name FROM vendors WHERE id = ?').get(input.vendorId) as
      | { id: number; name: string }
      | undefined;
    if (!vendor) throw new Error('Vendor not found.');

    let subtotal = 0;
    let vatTotal = 0;

    const prepared = input.items.map((item) => {
      if (item.quantity <= 0 || item.unitCost < 0) {
        throw new Error('Purchase quantity must be positive and cost non-negative.');
      }
      const lineSub = roundMoney(item.quantity * item.unitCost);
      const lineVat = roundMoney(lineSub * ((item.vatRate || 0) / 100));
      const lineTotal = roundMoney(lineSub + lineVat);
      subtotal = roundMoney(subtotal + lineSub);
      vatTotal = roundMoney(vatTotal + lineVat);
      return { ...item, lineSub, lineVat, lineTotal };
    });

    const grandTotal = roundMoney(subtotal + vatTotal);
    const seq = nextSequence(db, 'purchases');
    const year = input.purchaseDate.slice(0, 4) || String(new Date().getFullYear());
    const billNumber = `BILL-${year}-${String(seq).padStart(5, '0')}`;
    const mushak61Ref = input.mushak61Ref?.trim() || `M61-${year}-${String(seq).padStart(5, '0')}`;
    const paidAmount = input.payImmediately ? grandTotal : 0;
    const status: Purchase['status'] = input.payImmediately ? 'paid' : 'posted';

    const info = db
      .prepare(
        `INSERT INTO purchases (bill_number, mushak_61_ref, branch_id, vendor_id, purchase_date, subtotal, vat_total, grand_total, paid_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        billNumber,
        mushak61Ref,
        input.branchId,
        input.vendorId,
        input.purchaseDate,
        subtotal,
        vatTotal,
        grandTotal,
        paidAmount,
        status,
        input.notes || ''
      );

    const purchaseId = Number(info.lastInsertRowid);
    const insertItem = db.prepare(
      `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, vat_rate, vat_amount, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of prepared) {
      insertItem.run(
        purchaseId,
        item.productId,
        item.quantity,
        item.unitCost,
        item.vatRate || 0,
        item.lineVat,
        item.lineTotal
      );

      const stockRow = db
        .prepare('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?')
        .get(input.branchId, item.productId) as
        | { id: number; quantity: number; avg_cost: number; fifo_lots_json: string }
        | undefined;

      const calc = computeWeightedAvgStockIn(
        stockRow?.quantity ?? 0,
        stockRow?.avg_cost ?? item.unitCost,
        item.quantity,
        item.unitCost
      );
      const lots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];
      lots.push({ qty: item.quantity, unitCost: item.unitCost });

      if (stockRow) {
        db.prepare('UPDATE branch_stock SET quantity = ?, avg_cost = ?, fifo_lots_json = ? WHERE id = ?').run(
          calc.newQty,
          calc.newAvgCost,
          JSON.stringify(lots),
          stockRow.id
        );
      } else {
        db.prepare(
          'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)'
        ).run(input.branchId, item.productId, calc.newQty, calc.newAvgCost, JSON.stringify(lots));
      }

      db.prepare('UPDATE products SET cost_price = ? WHERE id = ?').run(calc.newAvgCost, item.productId);

      db.prepare(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date)
         VALUES (?, ?, 'in', ?, ?, ?, 'purchase', ?, ?)`
      ).run(
        input.branchId,
        item.productId,
        item.quantity,
        item.unitCost,
        item.lineSub,
        purchaseId,
        input.purchaseDate
      );
    }

    const creditAccount = input.payImmediately
      ? paymentMethodToAccountCode(input.paymentMethod || 'bank')
      : '2000';

    const lines: JournalLine[] = [
      {
        accountCode: '1200',
        debit: subtotal,
        credit: 0,
        memo: `Inventory Purchase: ${billNumber}`,
      },
      {
        accountCode: creditAccount,
        debit: 0,
        credit: grandTotal,
        memo: input.payImmediately ? `Paid Vendor: ${vendor.name}` : `Payable to ${vendor.name}`,
      },
    ];
    if (vatTotal > 0) {
      lines.push({
        accountCode: '1300',
        debit: vatTotal,
        credit: 0,
        memo: `Input VAT Credit (${mushak61Ref})`,
      });
    }

    const journalEntryId = postJournalEntry(db, {
      entryDate: input.purchaseDate,
      branchId: input.branchId,
      sourceType: 'purchase',
      sourceId: purchaseId,
      description: `Purchase ${billNumber} from ${vendor.name} (${mushak61Ref})`,
      lines,
      actor,
    });

    db.prepare('UPDATE purchases SET journal_entry_id = ? WHERE id = ?').run(journalEntryId, purchaseId);

    db.prepare(
      `INSERT INTO documents (doc_type, reference_number, entity_type, entity_id, title, party_name, amount, issued_at)
       VALUES ('purchase_bill', ?, 'purchase', ?, ?, ?, ?, ?)`
    ).run(billNumber, purchaseId, `Purchase Bill ${billNumber} (${mushak61Ref})`, vendor.name, grandTotal, input.purchaseDate);

    writeAuditLog(
      db,
      actor,
      'PURCHASE_POSTED',
      'purchase',
      purchaseId,
      `Posted ${billNumber} (${mushak61Ref}) from ${vendor.name}: Total ${grandTotal}, Input VAT ${vatTotal}`
    );

    return {
      id: purchaseId,
      billNumber,
      mushak61Ref,
      branchId: input.branchId,
      vendorId: input.vendorId,
      vendorName: vendor.name,
      purchaseDate: input.purchaseDate,
      subtotal,
      vatTotal,
      grandTotal,
      paidAmount,
      status,
      journalEntryId,
      notes: input.notes || '',
      createdAt: new Date().toISOString(),
    };
  });

  return tx();
}

/**
 * Expense Engine: Expense -> Optional Input VAT -> Double-entry Journal -> Audit Log
 */
export function createExpenseTransaction(
  db: Database.Database,
  input: {
    branchId: number;
    expenseDate: string;
    category: string;
    accountCode: string;
    vendorName: string;
    amount: number;
    vatAmount?: number;
    paymentMethod: PaymentMethod;
    reference?: string;
    notes?: string;
  },
  actor: ActorContext
): Expense {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Expense amount must be greater than zero.');
  }
  const vatAmount = Math.max(0, roundMoney(input.vatAmount || 0));
  const amount = roundMoney(input.amount);
  const totalAmount = roundMoney(amount + vatAmount);

  const tx = db.transaction(() => {
    const seq = nextSequence(db, 'expenses');
    const year = input.expenseDate.slice(0, 4) || String(new Date().getFullYear());
    const expenseNumber = `EXP-${year}-${String(seq).padStart(5, '0')}`;

    const info = db
      .prepare(
        `INSERT INTO expenses (
          expense_number, branch_id, expense_date, category, account_code, vendor_name,
          amount, vat_amount, total_amount, payment_method, reference, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        expenseNumber,
        input.branchId,
        input.expenseDate,
        input.category,
        input.accountCode,
        input.vendorName || '',
        amount,
        vatAmount,
        totalAmount,
        input.paymentMethod,
        input.reference || '',
        input.notes || ''
      );

    const expenseId = Number(info.lastInsertRowid);
    const creditAccount = paymentMethodToAccountCode(input.paymentMethod);

    const lines: JournalLine[] = [
      {
        accountCode: input.accountCode,
        debit: amount,
        credit: 0,
        memo: `${input.category}: ${input.vendorName || expenseNumber}`,
      },
      {
        accountCode: creditAccount,
        debit: 0,
        credit: totalAmount,
        memo: `Paid via ${input.paymentMethod}`,
      },
    ];
    if (vatAmount > 0) {
      lines.push({
        accountCode: '1300',
        debit: vatAmount,
        credit: 0,
        memo: `Input VAT on ${expenseNumber}`,
      });
    }

    const journalEntryId = postJournalEntry(db, {
      entryDate: input.expenseDate,
      branchId: input.branchId,
      sourceType: 'expense',
      sourceId: expenseId,
      description: `Expense ${expenseNumber} — ${input.category}`,
      lines,
      actor,
    });

    db.prepare('UPDATE expenses SET journal_entry_id = ? WHERE id = ?').run(journalEntryId, expenseId);

    writeAuditLog(
      db,
      actor,
      'EXPENSE_POSTED',
      'expense',
      expenseId,
      `Posted expense ${expenseNumber} (${input.category}): Total ${totalAmount}`
    );

    return {
      id: expenseId,
      expenseNumber,
      branchId: input.branchId,
      expenseDate: input.expenseDate,
      category: input.category,
      accountCode: input.accountCode,
      vendorName: input.vendorName || '',
      amount,
      vatAmount,
      totalAmount,
      paymentMethod: input.paymentMethod,
      reference: input.reference || '',
      notes: input.notes || '',
      journalEntryId,
      createdAt: new Date().toISOString(),
    };
  });

  return tx();
}

/**
 * Recurring Billing Engine: evaluates active profiles and generates idempotent invoices.
 */
export function runRecurringProfileNow(
  db: Database.Database,
  profileId: number,
  actor: ActorContext
): Invoice {
  const row = db.prepare('SELECT * FROM recurring_profiles WHERE id = ?').get(profileId) as
    | {
        id: number;
        title: string;
        customer_id: number;
        branch_id: number;
        frequency: RecurringFrequency;
        next_run_date: string;
        status: string;
        items_json: string;
      }
    | undefined;

  if (!row) throw new Error('Recurring billing profile not found.');
  if (row.status !== 'active') throw new Error('Recurring profile is paused.');

  const items = JSON.parse(row.items_json) as InvoiceLineInput[];
  const issueDate = todayISO();
  const dueDate = computeNextRecurringDate(issueDate, 'weekly');
  const idempotencyKey = `recurring:${row.id}:${row.next_run_date}`;

  const invoice = createInvoiceTransaction(
    db,
    {
      branchId: row.branch_id,
      customerId: row.customer_id,
      issueDate,
      dueDate,
      notes: `Auto-generated from recurring schedule: ${row.title}`,
      source: 'recurring',
      items,
      idempotencyKey,
    },
    actor
  );

  const nextRun = computeNextRecurringDate(row.next_run_date, row.frequency);
  db.prepare('UPDATE recurring_profiles SET last_run_date = ?, next_run_date = ? WHERE id = ?').run(
    issueDate,
    nextRun,
    row.id
  );

  return invoice;
}

export function getInvoiceById(db: Database.Database, id: number): Invoice | null {
  const row = db
    .prepare(
      `SELECT i.*,
              b.name as branch_name, b.name_bn as branch_name_bn,
              b.address as branch_address, b.phone as branch_phone,
              c.code as customer_code, c.name as customer_name,
              c.company_name as customer_company_name, c.bin_number as customer_bin,
              c.address as customer_address, c.phone as customer_phone, c.email as customer_email
       FROM invoices i
       INNER JOIN branches b ON b.id = i.branch_id
       INNER JOIN customers c ON c.id = i.customer_id
       WHERE i.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  const items = db
    .prepare(
      `SELECT ii.product_id as productId,
              COALESCE(p.sku, '') as productSku,
              COALESCE(p.unit, '') as productUnit,
              ii.description, ii.quantity, ii.unit_price as unitPrice,
              ii.discount_amount as discountAmount, ii.tax_rule_id as taxRuleId, ii.tax_rate as taxRate,
              ii.sd_rate as sdRate, ii.taxable_value as taxableValue, ii.sd_amount as sdAmount,
              ii.vat_amount as vatAmount, ii.line_total as lineTotal
       FROM invoice_items ii
       LEFT JOIN products p ON p.id = ii.product_id
       WHERE ii.invoice_id = ?`
    )
    .all(id) as Invoice['items'];

  const grandTotal = Number(row.grand_total);
  const paidAmount = Number(row.paid_amount);

  return {
    id: Number(row.id),
    invoiceNumber: String(row.invoice_number),
    mushakChallanNo: String(row.mushak_challan_no),
    branchId: Number(row.branch_id),
    branchName: String(row.branch_name),
    branchNameBn: String(row.branch_name_bn || ''),
    branchAddress: String(row.branch_address || ''),
    branchPhone: String(row.branch_phone || ''),
    customerId: Number(row.customer_id),
    customerCode: String(row.customer_code || ''),
    customerName: String(row.customer_name),
    customerCompanyName: String(row.customer_company_name || ''),
    customerBin: String(row.customer_bin || ''),
    customerAddress: String(row.customer_address || ''),
    customerPhone: String(row.customer_phone || ''),
    customerEmail: String(row.customer_email || ''),
    issueDate: String(row.issue_date),
    dueDate: String(row.due_date),
    status: resolveInvoiceStatus({
      grandTotal,
      paidAmount,
      dueDate: String(row.due_date),
      today: todayISO(),
      currentStatus: row.status as Invoice['status'],
    }),
    source: row.source as Invoice['source'],
    subtotal: Number(row.subtotal),
    discountTotal: Number(row.discount_total),
    sdTotal: Number(row.sd_total),
    vatTotal: Number(row.vat_total),
    grandTotal,
    paidAmount,
    balanceDue: roundMoney(grandTotal - paidAmount),
    notes: String(row.notes || ''),
    journalEntryId: row.journal_entry_id ? Number(row.journal_entry_id) : null,
    items,
    createdAt: String(row.created_at),
  };
}

export function listCustomersWithBalances(db: Database.Database): Customer[] {
  const rows = db
    .prepare(
      `SELECT c.*,
              COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = c.id AND status != 'void'), 0) as total_invoiced,
              COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = c.id), 0) as total_paid
       FROM customers c
       ORDER BY c.id DESC`
    )
    .all() as Record<string, unknown>[];

  return rows.map((r) => {
    const opening = Number(r.opening_balance || 0);
    const totalInvoiced = Number(r.total_invoiced || 0);
    const totalPaid = Number(r.total_paid || 0);
    return {
      id: Number(r.id),
      code: String(r.code),
      name: String(r.name),
      companyName: String(r.company_name || ''),
      phone: String(r.phone || ''),
      email: String(r.email || ''),
      binNumber: String(r.bin_number || ''),
      address: String(r.address || ''),
      openingBalance: opening,
      creditLimit: Number(r.credit_limit || 0),
      totalInvoiced: roundMoney(totalInvoiced),
      totalPaid: roundMoney(totalPaid),
      receivableBalance: roundMoney(opening + totalInvoiced - totalPaid),
      createdAt: String(r.created_at),
    };
  });
}

export function getCustomerStatementData(
  db: Database.Database,
  customerId: number
): { customer: Customer; rows: StatementRow[]; closingBalance: number } {
  const customers = listCustomersWithBalances(db);
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) throw new Error('Customer not found.');

  const invoices = db
    .prepare(
      `SELECT issue_date as date, invoice_number as reference, mushak_challan_no as challan, grand_total as amount
       FROM invoices WHERE customer_id = ? AND status != 'void'`
    )
    .all(customerId) as { date: string; reference: string; challan: string; amount: number }[];

  const payments = db
    .prepare(
      `SELECT payment_date as date, payment_number as reference, method, amount
       FROM payments WHERE customer_id = ?`
    )
    .all(customerId) as { date: string; reference: string; method: string; amount: number }[];

  const txs = [
    ...invoices.map((i) => ({
      date: i.date,
      type: 'invoice' as const,
      reference: i.reference,
      description: `Invoice (${i.challan})`,
      amount: i.amount,
    })),
    ...payments.map((p) => ({
      date: p.date,
      type: 'payment' as const,
      reference: p.reference,
      description: `Payment Received (${p.method.toUpperCase()})`,
      amount: p.amount,
    })),
  ];

  const statement = buildCustomerStatement(customer.openingBalance, txs);
  return { customer, rows: statement.rows, closingBalance: statement.closingBalance };
}

export function sanitizeProductImageUrl(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^\/src\/assets\/images\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/.test(value)) {
    return value;
  }
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    if (value.length > 700_000) {
      throw new Error('Product image exceeds maximum allowed size (500KB).');
    }
    return value;
  }
  throw new Error('Invalid product image format. Only JPG, PNG, or WebP images are supported.');
}

export function listProductsWithStock(db: Database.Database, branchId?: number): Product[] {
  const rows = db
    .prepare(
      `SELECT p.*, tr.rate as tax_rate,
              COALESCE(
                CASE WHEN ? IS NOT NULL
                  THEN (SELECT quantity FROM branch_stock WHERE product_id = p.id AND branch_id = ?)
                  ELSE (SELECT SUM(quantity) FROM branch_stock WHERE product_id = p.id)
                END, 0
              ) as stock_qty,
              COALESCE(
                CASE WHEN ? IS NOT NULL
                  THEN (SELECT quantity * avg_cost FROM branch_stock WHERE product_id = p.id AND branch_id = ?)
                  ELSE (SELECT SUM(quantity * avg_cost) FROM branch_stock WHERE product_id = p.id)
                END, 0
              ) as stock_value
       FROM products p
       LEFT JOIN tax_rules tr ON tr.id = p.tax_rule_id
       ORDER BY p.id ASC`
    )
    .all(branchId ?? null, branchId ?? null, branchId ?? null, branchId ?? null) as Record<
    string,
    unknown
  >[];

  const allBranches = db
    .prepare('SELECT id, code, name, name_bn FROM branches ORDER BY is_main DESC, id ASC')
    .all() as { id: number; code: string; name: string; name_bn: string }[];

  const stockRows = db
    .prepare('SELECT branch_id, product_id, quantity, avg_cost FROM branch_stock')
    .all() as { branch_id: number; product_id: number; quantity: number; avg_cost: number }[];

  const stockLookup = new Map<string, { quantity: number; avgCost: number }>();
  for (const sr of stockRows) {
    stockLookup.set(`${sr.product_id}:${sr.branch_id}`, {
      quantity: Number(sr.quantity || 0),
      avgCost: Number(sr.avg_cost || 0),
    });
  }

  return rows.map((r) => {
    const id = Number(r.id);
    const costPrice = Number(r.cost_price);
    const branchStocks: ProductBranchStock[] = allBranches.map((b) => {
      const match = stockLookup.get(`${id}:${b.id}`);
      const quantity = roundMoney(match?.quantity ?? 0);
      const avgCost = roundMoney(match ? match.avgCost : costPrice);
      return {
        branchId: b.id,
        branchCode: b.code,
        branchName: b.name,
        branchNameBn: b.name_bn,
        quantity,
        avgCost,
        stockValue: roundMoney(quantity * avgCost),
      };
    });

    return {
      id,
      sku: String(r.sku),
      barcode: String(r.barcode || r.sku),
      brand: String(r.brand || ''),
      name: String(r.name),
      nameBn: String(r.name_bn || r.name),
      unit: String(r.unit),
      category: String(r.category),
      hsCode: String(r.hs_code || ''),
      description: String(r.description || ''),
      imageUrl: String(r.image_url || ''),
      isActive: r.is_active === undefined ? true : Boolean(r.is_active),
      trackInventory: Boolean(r.track_inventory),
      salePrice: Number(r.sale_price),
      costPrice,
      taxRuleId: r.tax_rule_id ? Number(r.tax_rule_id) : null,
      taxRate: Number(r.tax_rate ?? 15),
      reorderLevel: Number(r.reorder_level),
      stockQty: roundMoney(Number(r.stock_qty || 0)),
      stockValue: roundMoney(Number(r.stock_value || 0)),
      branchStocks,
    };
  });
}

export function updateProductRecord(
  db: Database.Database,
  productId: number,
  input: {
    sku?: string;
    barcode?: string;
    brand?: string;
    name: string;
    nameBn?: string;
    unit?: string;
    category?: string;
    hsCode?: string;
    description?: string;
    imageUrl?: string;
    isActive?: boolean;
    trackInventory?: boolean;
    salePrice: number;
    costPrice: number;
    taxRuleId?: number | null;
    reorderLevel?: number;
  },
  actor: ActorContext
): { id: number; sku: string } {
  const existing = db.prepare('SELECT id, sku FROM products WHERE id = ?').get(productId) as
    | { id: number; sku: string }
    | undefined;
  if (!existing) throw new Error('Product not found.');

  const name = String(input.name || '').trim();
  if (!name) throw new Error('Product name is required.');

  const finalSku = String(input.sku || existing.sku).trim() || existing.sku;
  const safeImageUrl = sanitizeProductImageUrl(input.imageUrl);

  db.prepare(
    `UPDATE products
     SET sku = ?, barcode = ?, brand = ?, name = ?, name_bn = ?, unit = ?, category = ?,
         hs_code = ?, description = ?, image_url = ?, is_active = ?, track_inventory = ?,
         sale_price = ?, cost_price = ?, tax_rule_id = ?, reorder_level = ?
     WHERE id = ?`
  ).run(
    finalSku,
    String(input.barcode || finalSku).trim(),
    String(input.brand || '').trim(),
    name,
    String(input.nameBn || name).trim(),
    String(input.unit || 'pcs').trim(),
    String(input.category || 'General').trim(),
    String(input.hsCode || '').trim(),
    String(input.description || '').trim(),
    safeImageUrl,
    input.isActive === false ? 0 : 1,
    input.trackInventory === false ? 0 : 1,
    Math.max(0, Number(input.salePrice) || 0),
    Math.max(0, Number(input.costPrice) || 0),
    input.taxRuleId ? Number(input.taxRuleId) : 1,
    Math.max(0, Number(input.reorderLevel) || 0),
    productId
  );

  writeAuditLog(
    db,
    actor,
    'PRODUCT_UPDATED',
    'product',
    productId,
    `Updated product ${name} (${finalSku})`
  );

  return { id: productId, sku: finalSku };
}

export function listProductStockMovements(db: Database.Database, productId: number): StockMovementRecord[] {
  const rows = db
    .prepare(
      `SELECT sm.*, b.name as branch_name, b.name_bn as branch_name_bn
       FROM stock_movements sm
       INNER JOIN branches b ON b.id = sm.branch_id
       WHERE sm.product_id = ?
       ORDER BY sm.movement_date DESC, sm.id DESC
       LIMIT 100`
    )
    .all(productId) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: Number(r.id),
    branchId: Number(r.branch_id),
    branchName: String(r.branch_name),
    branchNameBn: String(r.branch_name_bn),
    productId: Number(r.product_id),
    movementType: r.movement_type as StockMovementRecord['movementType'],
    quantity: roundMoney(Number(r.quantity)),
    unitCost: roundMoney(Number(r.unit_cost)),
    totalCost: roundMoney(Number(r.total_cost)),
    sourceType: String(r.source_type),
    sourceId: r.source_id ? Number(r.source_id) : null,
    movementDate: String(r.movement_date),
    notes: String(r.notes || ''),
    createdAt: String(r.created_at),
  }));
}

export function adjustProductStockTransaction(
  db: Database.Database,
  input: {
    productId: number;
    branchId: number;
    mode: 'add' | 'reduce' | 'set';
    quantity: number;
    unitCost?: number;
    reason: string;
    date?: string;
  },
  actor: ActorContext
): { newQuantity: number; delta: number; journalEntryId: number | null } {
  const tx = db.transaction(() => {
    const prod = db
      .prepare('SELECT id, sku, name, cost_price, track_inventory FROM products WHERE id = ?')
      .get(input.productId) as
      | { id: number; sku: string; name: string; cost_price: number; track_inventory: number }
      | undefined;
    if (!prod) throw new Error('Product not found.');
    if (!prod.track_inventory) throw new Error('Cannot adjust stock for a non-inventory service.');

    const branch = db.prepare('SELECT id, name FROM branches WHERE id = ?').get(input.branchId) as
      | { id: number; name: string }
      | undefined;
    if (!branch) throw new Error('Branch not found.');

    const rawQty = Number(input.quantity);
    if (!Number.isFinite(rawQty) || rawQty < 0) throw new Error('Quantity must be a valid non-negative number.');
    if (input.mode !== 'set' && rawQty <= 0) throw new Error('Adjustment quantity must be greater than zero.');

    const org = getOrganization(db);
    const stockRow = db
      .prepare('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?')
      .get(input.branchId, input.productId) as
      | { id: number; quantity: number; avg_cost: number; fifo_lots_json: string }
      | undefined;

    const currentQty = stockRow ? Number(stockRow.quantity) : 0;
    const currentAvg = stockRow ? Number(stockRow.avg_cost) : Number(prod.cost_price);
    const currentLots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];

    let delta = 0;
    if (input.mode === 'add') delta = rawQty;
    else if (input.mode === 'reduce') delta = -rawQty;
    else delta = roundMoney(rawQty - currentQty);

    if (Math.abs(delta) < 0.0001) {
      throw new Error('New stock count matches current branch stock (no change required).');
    }
    const newQuantity = roundMoney(currentQty + delta);
    if (newQuantity < 0) {
      throw new Error(`Insufficient stock in ${branch.name}. Available: ${currentQty}.`);
    }

    const effectiveUnitCost = Math.max(
      0,
      input.unitCost !== undefined && Number.isFinite(Number(input.unitCost)) ? Number(input.unitCost) : currentAvg || prod.cost_price
    );
    const movementDate = input.date || todayISO();
    const reasonText = String(input.reason || 'Manual stock adjustment').trim();
    let totalCostDelta = 0;
    let nextAvg = currentAvg || effectiveUnitCost;
    let nextLots = currentLots;

    if (delta > 0) {
      const updated = computeWeightedAvgStockIn(currentQty, currentAvg, delta, effectiveUnitCost);
      nextAvg = updated.newAvgCost;
      nextLots = [...currentLots, { qty: delta, unitCost: effectiveUnitCost }];
      totalCostDelta = roundMoney(delta * effectiveUnitCost);
    } else {
      const outRes = computeStockOutCOGS({
        method: org.inventoryMethod,
        currentQty,
        currentAvgCost: currentAvg || effectiveUnitCost,
        soldQty: Math.abs(delta),
        fifoLots: currentLots,
      });
      nextLots = outRes.remainingLots ?? currentLots;
      totalCostDelta = roundMoney(outRes.cogsTotal);
    }

    if (stockRow) {
      db.prepare('UPDATE branch_stock SET quantity = ?, avg_cost = ?, fifo_lots_json = ? WHERE id = ?').run(
        newQuantity,
        nextAvg,
        JSON.stringify(nextLots),
        stockRow.id
      );
    } else {
      db.prepare(
        'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)'
      ).run(input.branchId, input.productId, newQuantity, nextAvg, JSON.stringify(nextLots));
    }

    const mvInfo = db
      .prepare(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
         VALUES (?, ?, 'adjustment', ?, ?, ?, 'adjustment', NULL, ?, ?)`
      )
      .run(
        input.branchId,
        input.productId,
        delta,
        delta > 0 ? effectiveUnitCost : roundMoney(totalCostDelta / Math.abs(delta)),
        totalCostDelta,
        movementDate,
        reasonText
      );

    let journalEntryId: number | null = null;
    if (totalCostDelta > 0) {
      const lines: JournalLine[] =
        delta > 0
          ? [
              { accountCode: '1200', debit: totalCostDelta, credit: 0, memo: `Stock increase: ${prod.sku} (+${delta})` },
              { accountCode: '5000', debit: 0, credit: totalCostDelta, memo: reasonText },
            ]
          : [
              { accountCode: '5000', debit: totalCostDelta, credit: 0, memo: reasonText },
              { accountCode: '1200', debit: 0, credit: totalCostDelta, memo: `Stock reduction: ${prod.sku} (${delta})` },
            ];
      journalEntryId = postJournalEntry(db, {
        entryDate: movementDate,
        branchId: input.branchId,
        sourceType: 'stock_adjustment',
        sourceId: Number(mvInfo.lastInsertRowid),
        description: `Stock Adjustment · ${prod.name} (${delta > 0 ? '+' : ''}${delta}) — ${reasonText}`,
        lines,
        actor,
      });
    }

    writeAuditLog(
      db,
      actor,
      'STOCK_ADJUSTED',
      'product',
      input.productId,
      `Adjusted ${prod.sku} in ${branch.name}: ${currentQty} -> ${newQuantity} (${reasonText})`
    );

    return { newQuantity, delta, journalEntryId };
  });

  return tx();
}

export function transferProductStockTransaction(
  db: Database.Database,
  input: {
    productId: number;
    fromBranchId: number;
    toBranchId: number;
    quantity: number;
    notes?: string;
    date?: string;
  },
  actor: ActorContext
): { transferredQty: number; unitCost: number } {
  const tx = db.transaction(() => {
    if (input.fromBranchId === input.toBranchId) {
      throw new Error('Source and destination branches must be different.');
    }
    const qty = Number(input.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('Transfer quantity must be greater than zero.');
    }

    const prod = db
      .prepare('SELECT id, sku, name, cost_price, track_inventory FROM products WHERE id = ?')
      .get(input.productId) as
      | { id: number; sku: string; name: string; cost_price: number; track_inventory: number }
      | undefined;
    if (!prod) throw new Error('Product not found.');
    if (!prod.track_inventory) throw new Error('Cannot transfer stock for a service item.');

    const fromBranch = db.prepare('SELECT id, name FROM branches WHERE id = ?').get(input.fromBranchId) as
      | { id: number; name: string }
      | undefined;
    const toBranch = db.prepare('SELECT id, name FROM branches WHERE id = ?').get(input.toBranchId) as
      | { id: number; name: string }
      | undefined;
    if (!fromBranch || !toBranch) throw new Error('Invalid source or destination branch.');

    const srcRow = db
      .prepare('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?')
      .get(input.fromBranchId, input.productId) as
      | { id: number; quantity: number; avg_cost: number; fifo_lots_json: string }
      | undefined;

    const available = srcRow ? Number(srcRow.quantity) : 0;
    if (!srcRow || available < qty) {
      throw new Error(`Insufficient stock in ${fromBranch.name}. Available: ${available}.`);
    }

    const org = getOrganization(db);
    const srcLots: StockLot[] = JSON.parse(srcRow.fifo_lots_json || '[]');
    const outRes = computeStockOutCOGS({
      method: org.inventoryMethod,
      currentQty: available,
      currentAvgCost: Number(srcRow.avg_cost) || prod.cost_price,
      soldQty: qty,
      fifoLots: srcLots,
    });
    const transferUnitCost = roundMoney(qty > 0 ? outRes.cogsTotal / qty : Number(srcRow.avg_cost));
    const totalTransferCost = roundMoney(outRes.cogsTotal);

    // Deduct source branch
    db.prepare('UPDATE branch_stock SET quantity = ?, fifo_lots_json = ? WHERE id = ?').run(
      roundMoney(available - qty),
      JSON.stringify(outRes.remainingLots ?? srcLots),
      srcRow.id
    );

    // Credit destination branch
    const dstRow = db
      .prepare('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?')
      .get(input.toBranchId, input.productId) as
      | { id: number; quantity: number; avg_cost: number; fifo_lots_json: string }
      | undefined;

    if (dstRow) {
      const dstLots: StockLot[] = JSON.parse(dstRow.fifo_lots_json || '[]');
      const dstUpd = computeWeightedAvgStockIn(Number(dstRow.quantity), Number(dstRow.avg_cost), qty, transferUnitCost);
      dstLots.push({ qty, unitCost: transferUnitCost });
      db.prepare('UPDATE branch_stock SET quantity = ?, avg_cost = ?, fifo_lots_json = ? WHERE id = ?').run(
        dstUpd.newQty,
        dstUpd.newAvgCost,
        JSON.stringify(dstLots),
        dstRow.id
      );
    } else {
      db.prepare(
        'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)'
      ).run(input.toBranchId, input.productId, qty, transferUnitCost, JSON.stringify([{ qty, unitCost: transferUnitCost }]));
    }

    const movementDate = input.date || todayISO();
    const noteBase = String(input.notes || '').trim();
    const outNote = `Transfer to ${toBranch.name}${noteBase ? ` · ${noteBase}` : ''}`;
    const inNote = `Transfer from ${fromBranch.name}${noteBase ? ` · ${noteBase}` : ''}`;

    const outMv = db
      .prepare(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
         VALUES (?, ?, 'out', ?, ?, ?, 'transfer_out', ?, ?, ?)`
      )
      .run(input.fromBranchId, input.productId, -qty, transferUnitCost, totalTransferCost, input.toBranchId, movementDate, outNote);

    db.prepare(
      `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
       VALUES (?, ?, 'in', ?, ?, ?, 'transfer_in', ?, ?, ?)`
    ).run(input.toBranchId, input.productId, qty, transferUnitCost, totalTransferCost, Number(outMv.lastInsertRowid), movementDate, inNote);

    writeAuditLog(
      db,
      actor,
      'STOCK_TRANSFERRED',
      'product',
      input.productId,
      `Transferred ${qty} of ${prod.sku} from ${fromBranch.name} to ${toBranch.name}`
    );

    return { transferredQty: qty, unitCost: transferUnitCost };
  });

  return tx();
}

export function computeReportsFromLedger(
  db: Database.Database,
  branchId?: number
): FinancialReportSummary {
  const accounts = db
    .prepare('SELECT id, code, name, name_bn as nameBn, type, is_system as isSystem FROM accounts ORDER BY code ASC')
    .all() as Account[];

  const postedLines = (branchId
    ? db
        .prepare(
          `SELECT a.code as accountCode, a.name as accountName, a.name_bn as accountNameBn,
                  a.type as accountType, jl.debit, jl.credit, je.source_type as sourceType
           FROM journal_lines jl
           INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
           INNER JOIN accounts a ON a.id = jl.account_id
           WHERE je.branch_id = ?`
        )
        .all(branchId)
    : db
        .prepare(
          `SELECT a.code as accountCode, a.name as accountName, a.name_bn as accountNameBn,
                  a.type as accountType, jl.debit, jl.credit, je.source_type as sourceType
           FROM journal_lines jl
           INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
           INNER JOIN accounts a ON a.id = jl.account_id`
        )
        .all()) as {
    accountCode: string;
    accountName: string;
    accountNameBn: string;
    accountType: Account['type'];
    debit: number;
    credit: number;
    sourceType: string;
  }[];

  const invAgg = (branchId
    ? db
        .prepare(
          `SELECT COALESCE(SUM(subtotal), 0) as taxableSales, COALESCE(SUM(sd_total), 0) as sdPayable, COUNT(*) as challanCount
           FROM invoices WHERE status != 'void' AND branch_id = ?`
        )
        .get(branchId)
    : db
        .prepare(
          `SELECT COALESCE(SUM(subtotal), 0) as taxableSales, COALESCE(SUM(sd_total), 0) as sdPayable, COUNT(*) as challanCount
           FROM invoices WHERE status != 'void'`
        )
        .get()) as { taxableSales: number; sdPayable: number; challanCount: number };

  const purAgg = (branchId
    ? db
        .prepare(
          `SELECT COALESCE(SUM(subtotal), 0) as taxablePurchases FROM purchases WHERE status != 'void' AND branch_id = ?`
        )
        .get(branchId)
    : db
        .prepare(`SELECT COALESCE(SUM(subtotal), 0) as taxablePurchases FROM purchases WHERE status != 'void'`)
        .get()) as { taxablePurchases: number };

  return generateFinancialReports(accounts, postedLines, {
    taxableSales: Number(invAgg?.taxableSales || 0),
    taxablePurchases: Number(purAgg?.taxablePurchases || 0),
    sdPayable: Number(invAgg?.sdPayable || 0),
    challanCount: Number(invAgg?.challanCount || 0),
  });
}

export function computeSystemAlerts(db: Database.Database, branchId?: number): AlertItem[] {
  const alerts: AlertItem[] = [];
  const today = todayISO();

  // 1. Overdue Invoices
  const overdueRows = (branchId
    ? db
        .prepare(
          `SELECT i.id, i.invoice_number, i.due_date, ROUND(i.grand_total - i.paid_amount, 2) as due, c.name as customer_name
           FROM invoices i INNER JOIN customers c ON c.id = i.customer_id
           WHERE i.status NOT IN ('paid','void','draft') AND i.due_date < ? AND ROUND(i.grand_total - i.paid_amount, 2) > 0 AND i.branch_id = ?`
        )
        .all(today, branchId)
    : db
        .prepare(
          `SELECT i.id, i.invoice_number, i.due_date, ROUND(i.grand_total - i.paid_amount, 2) as due, c.name as customer_name
           FROM invoices i INNER JOIN customers c ON c.id = i.customer_id
           WHERE i.status NOT IN ('paid','void','draft') AND i.due_date < ? AND ROUND(i.grand_total - i.paid_amount, 2) > 0`
        )
        .all(today)) as { id: number; invoice_number: string; due_date: string; due: number; customer_name: string }[];

  for (const ov of overdueRows) {
    alerts.push({
      id: `overdue-${ov.id}`,
      severity: 'critical',
      category: 'overdue',
      title: `Overdue invoice ${ov.invoice_number}`,
      titleBn: `বকেয়া ইনভয়েস ${ov.invoice_number}`,
      detail: `${ov.customer_name} owes ${formatMoney(ov.due, 'en', '৳')} (due ${formatDate(ov.due_date, 'en')})`,
      detailBn: `${ov.customer_name}-এর কাছে ${formatMoney(ov.due, 'bn', '৳')} বকেয়া (তারিখ: ${formatDate(ov.due_date, 'bn')})`,
      entityType: 'invoice',
      entityId: ov.id,
    });
  }

  // 2. Low Stock Alerts
  const products = listProductsWithStock(db, branchId);
  for (const p of products) {
    if (p.trackInventory && (p.stockQty ?? 0) <= p.reorderLevel) {
      alerts.push({
        id: `lowstock-${p.id}`,
        severity: (p.stockQty ?? 0) <= 0 ? 'critical' : 'warning',
        category: 'low_stock',
        title: `Low stock: ${p.name}`,
        titleBn: `স্টক কম: ${p.nameBn || p.name}`,
        detail: `${p.stockQty ?? 0} ${p.unit} remaining (reorder at ${p.reorderLevel})`,
        detailBn: `অবশিষ্ট ${formatNumber(p.stockQty ?? 0, 'bn')} ${p.unit} (রিঅর্ডার সীমা ${formatNumber(p.reorderLevel, 'bn')})`,
        entityType: 'product',
        entityId: p.id,
      });
    }
  }

  // 3. Due Recurring Schedules
  const recurringDue = db
    .prepare(
      `SELECT r.id, r.title, r.next_run_date, c.name as customer_name
       FROM recurring_profiles r INNER JOIN customers c ON c.id = r.customer_id
       WHERE r.status = 'active' AND r.next_run_date <= ?`
    )
    .all(today) as { id: number; title: string; next_run_date: string; customer_name: string }[];

  for (const rec of recurringDue) {
    alerts.push({
      id: `recurring-${rec.id}`,
      severity: 'info',
      category: 'recurring',
      title: `Recurring billing due: ${rec.title}`,
      titleBn: `নিয়মিত ইনভয়েস তৈরির সময় হয়েছে: ${rec.title}`,
      detail: `${rec.customer_name} scheduled for ${formatDate(rec.next_run_date, 'en')}`,
      detailBn: `${rec.customer_name} — নির্ধারিত তারিখ ${formatDate(rec.next_run_date, 'bn')}`,
      entityType: 'recurring',
      entityId: rec.id,
    });
  }

  return alerts;
}

export interface OnboardWorkspaceInput {
  ownerName: string;
  ownerEmail: string;
  passwordHash: string;
  orgNameBn: string;
  orgNameEn: string;
  proprietorName?: string;
  phone: string;
  address: string;
  binNumber?: string;
  tinNumber?: string;
  tagline?: string;
  website?: string;
  businessDescription?: string;
  vatMode?: TaxMode;
  defaultLanguage?: 'bn' | 'en';
  branchNameBn?: string;
  branchNameEn?: string;
  branchCode?: string;
}

/**
 * Atomic First-Run 2-Step Onboarding Transaction:
 * 1) Creates the Owner User account with scrypt password hash
 * 2) Configures the Organization profile & Main Branch in a single SQLite transaction
 */
export function onboardWorkspaceTransaction(
  db: Database.Database,
  input: OnboardWorkspaceInput
): {
  userId: number;
  branchId: number;
  user: {
    id: number;
    name: string;
    email: string;
    role: 'owner';
    branchId: number;
  };
} {
  const ownerName = String(input.ownerName || '').trim().slice(0, 120);
  const ownerEmail = String(input.ownerEmail || '').trim().toLowerCase().slice(0, 120);
  const passwordHash = String(input.passwordHash || '').trim();
  const rawNameBn = String(input.orgNameBn || '').trim().slice(0, 160);
  const rawNameEn = String(input.orgNameEn || '').trim().slice(0, 160);
  const orgNameBn = rawNameBn || rawNameEn;
  const orgNameEn = rawNameEn || rawNameBn;
  const proprietorName = String(input.proprietorName || ownerName).trim().slice(0, 120);
  const phone = String(input.phone || '').trim().slice(0, 80);
  const address = String(input.address || '').trim().slice(0, 260);
  const binNumber = String(input.binNumber || '').trim().slice(0, 60);
  const tinNumber = String(input.tinNumber || '').trim().slice(0, 60);
  const tagline = String(input.tagline || '').trim().slice(0, 160);
  const website = String(input.website || '').trim().slice(0, 120);
  const businessDescription = String(input.businessDescription || '').trim().slice(0, 320);
  const vatMode: TaxMode = input.vatMode === 'inclusive' ? 'inclusive' : 'exclusive';
  const defaultLanguage: 'bn' | 'en' = input.defaultLanguage === 'en' ? 'en' : 'bn';
  const branchNameBn = String(input.branchNameBn || 'প্রধান শাখা').trim().slice(0, 120) || 'প্রধান শাখা';
  const branchNameEn = String(input.branchNameEn || 'Main Branch').trim().slice(0, 120) || 'Main Branch';
  const branchCode =
    String(input.branchCode || 'MAIN')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 12) || 'MAIN';

  if (!ownerName) {
    throw new Error('ওনারের নাম আবশ্যক (Owner name is required).');
  }
  if (!ownerEmail || !ownerEmail.includes('@')) {
    throw new Error('সঠিক ইমেইল ঠিকানা আবশ্যক (Valid owner email is required).');
  }
  if (!passwordHash) {
    throw new Error('পাসওয়ার্ড আবশ্যক (Password is required).');
  }
  if (!orgNameBn && !orgNameEn) {
    throw new Error('প্রতিষ্ঠানের নাম আবশ্যক (Organization name is required).');
  }
  if (!phone) {
    throw new Error('মোবাইল নম্বর আবশ্যক (Business phone number is required).');
  }
  if (!address) {
    throw new Error('প্রতিষ্ঠানের ঠিকানা আবশ্যক (Business address is required).');
  }

  const tx = db.transaction(() => {
    const orgRow = db
      .prepare('SELECT onboarding_completed FROM organizations WHERE id = 1')
      .get() as { onboarding_completed?: number } | undefined;
    const activeUsersCount = (
      db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get() as { c: number }
    ).c;

    if (orgRow?.onboarding_completed === 1 && activeUsersCount > 0) {
      throw new Error('Onboarding has already been completed for this workspace.');
    }

    // Ensure clean user/branch slate before first-run provisioning
    db.exec(`
      DELETE FROM sessions;
      DELETE FROM users;
      DELETE FROM branches;
    `);

    const branchInfo = db
      .prepare(
        `INSERT INTO branches (code, name, name_bn, address, phone, is_main, is_active)
         VALUES (?, ?, ?, ?, ?, 1, 1)`
      )
      .run(branchCode, branchNameEn, branchNameBn, address, phone);
    const branchId = Number(branchInfo.lastInsertRowid);

    const userInfo = db
      .prepare(
        `INSERT INTO users (name, email, role, branch_id, password_hash, is_active)
         VALUES (?, ?, 'owner', ?, ?, 1)`
      )
      .run(ownerName, ownerEmail, branchId, passwordHash);
    const userId = Number(userInfo.lastInsertRowid);

    db.prepare(
      `UPDATE organizations
       SET name = ?,
           name_bn = ?,
           proprietor_name = ?,
           phone = ?,
           email = ?,
           address = ?,
           bin_number = ?,
           tin_number = ?,
           tagline = ?,
           website = ?,
           business_description = ?,
           vat_mode = ?,
           default_language = ?,
           admin_password_hash = ?,
           onboarding_completed = 1,
           updated_at = datetime('now')
       WHERE id = 1`
    ).run(
      orgNameEn,
      orgNameBn,
      proprietorName,
      phone,
      ownerEmail,
      address,
      binNumber,
      tinNumber,
      tagline,
      website,
      businessDescription,
      vatMode,
      defaultLanguage,
      passwordHash
    );

    writeAuditLog(
      db,
      { name: ownerName, role: 'owner' },
      'WORKSPACE_ONBOARDED',
      'organization',
      1,
      `Onboarded organization "${orgNameBn}" with main branch "${branchNameBn}" (${branchCode})`
    );

    return {
      userId,
      branchId,
      user: {
        id: userId,
        name: ownerName,
        email: ownerEmail,
        role: 'owner' as const,
        branchId,
      },
    };
  });

  return tx();
}

/**
 * Seeds deterministic test fixture data for automated unit tests (engineService.test.ts).
 */
export function seedSampleBusinessData(db: Database.Database, actor: ActorContext): void {
  const existingInvCount = (db.prepare('SELECT COUNT(*) as c FROM invoices').get() as { c: number }).c;
  if (existingInvCount > 0) return;

  const tx = db.transaction(() => {
    // 0. Ensure fixture organization, branches & users exist for unit test harness
    db.prepare(
      `UPDATE organizations
       SET name = CASE WHEN name = '' THEN 'Dhaka Trade & Textiles Ltd.' ELSE name END,
           name_bn = CASE WHEN name_bn = '' THEN 'ঢাকা ট্রেড অ্যান্ড টেক্সটাইলস লিমিটেড' ELSE name_bn END,
           bin_number = CASE WHEN bin_number = '' THEN '001948271-0101' ELSE bin_number END,
           tin_number = CASE WHEN tin_number = '' THEN '548291038472' ELSE tin_number END,
           phone = CASE WHEN phone = '' THEN '+880 1711-004821' ELSE phone END,
           email = CASE WHEN email = '' THEN 'accounts@dhakatrade.com.bd' ELSE email END,
           address = CASE WHEN address = '' THEN 'House 42, Road 11, Gulshan-1, Dhaka 1212, Bangladesh' ELSE address END,
           onboarding_completed = 1
       WHERE id = 1`
    ).run();

    const branchCount = (db.prepare('SELECT COUNT(*) as c FROM branches').get() as { c: number }).c;
    if (branchCount === 0) {
      db.prepare(
        `INSERT INTO branches (code, name, name_bn, address, phone, is_main) VALUES
         ('DHK', 'Dhaka Gulshan Main', 'ঢাকা গুলশান প্রধান শাখা', 'Road 11, Gulshan-1, Dhaka 1212', '+880 1711-004821', 1),
         ('CTG', 'Chattogram Agrabad', 'চট্টগ্রাম আগ্রাবাদ শাখা', 'Commercial Area, Agrabad, Chattogram 4100', '+880 1819-442190', 0)`
      ).run();
    }

    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    if (userCount === 0) {
      db.prepare(
        `INSERT INTO users (name, email, role, branch_id) VALUES
         ('Rafiqul Islam (Owner)', 'owner@dhakatrade.com.bd', 'owner', 1),
         ('Farhana Yasmin (Accountant)', 'accounts@dhakatrade.com.bd', 'accountant', 1),
         ('Tanvir Ahmed (POS Cashier)', 'pos@dhakatrade.com.bd', 'cashier', 1),
         ('Mahmudul Hasan (Auditor)', 'audit@dhakatrade.com.bd', 'auditor', NULL)`
      ).run();
    }

    // 1. Opening Capital Journal (Cash 150,000 + Bank 350,000 = Equity 500,000)
    const jeCount = (db.prepare('SELECT COUNT(*) as c FROM journal_entries').get() as { c: number }).c;
    if (jeCount === 0) {
      postJournalEntry(db, {
        entryDate: '2026-11-01',
        branchId: 1,
        sourceType: 'opening',
        sourceId: null,
        description: 'Opening Capital Injection (Cash & Prime Bank)',
        lines: [
          { accountCode: '1000', debit: 150000, credit: 0, memo: 'Opening Cash Drawer' },
          { accountCode: '1010', debit: 350000, credit: 0, memo: 'Opening Prime Bank Balance' },
          { accountCode: '3000', debit: 0, credit: 500000, memo: 'Owner Paid-up Capital' },
        ],
        actor,
      });
    }

    // 2. Customers
    const custStmt = db.prepare(
      `INSERT OR IGNORE INTO customers (code, name, company_name, phone, email, bin_number, address, opening_balance, credit_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    custStmt.run(
      'CUST-001',
      'Kamrul Hasan',
      'Padma Apparel Exports Ltd.',
      '+880 1712-338910',
      'finance@padmaapparel.com.bd',
      '002847192-0102',
      'Sector 7, Uttara, Dhaka 1230',
      0,
      500000
    );
    custStmt.run(
      'CUST-002',
      'Nusrat Jahan',
      'Bengal Craft Studio',
      '+880 1817-994120',
      'accounts@bengalcraft.bd',
      '003910482-0201',
      'Road 27, Dhanmondi, Dhaka 1209',
      0,
      250000
    );
    custStmt.run(
      'CUST-003',
      'Sajjad Hossain',
      'Karnaphuli Builders & Supply',
      '+880 1911-550291',
      'billing@karnaphulibuild.com',
      '004192837-0501',
      'CDA Avenue, Nasirabad, Chattogram',
      0,
      300000
    );
    custStmt.run(
      'CUST-004',
      'Walk-in Counter Customer',
      'Cash Counter Retail',
      '+880 1700-000000',
      '',
      '',
      'Gulshan-1 Counter, Dhaka',
      0,
      0
    );

    // 3. Vendors
    const vendStmt = db.prepare(
      `INSERT OR IGNORE INTO vendors (code, name, company_name, phone, email, bin_number, address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    vendStmt.run(
      'VEND-001',
      'Meghna Spinning Mills',
      'Meghna Group Textiles',
      '+880 1715-882100',
      'sales@meghnaspinning.com.bd',
      '001122334-0104',
      'Narayanganj Industrial Zone'
    );
    vendStmt.run(
      'VEND-002',
      'Jamuna Industrial Hardware',
      'Jamuna Hardware Corp.',
      '+880 1611-220491',
      'orders@jamunahardware.bd',
      '005544332-0103',
      'Nawabpur Road, Old Dhaka'
    );

    // 4. Products (with Bangladesh HS codes, brands, barcodes, studio visuals & tax rules)
    const prodStmt = db.prepare(
      `INSERT OR IGNORE INTO products (sku, barcode, brand, name, name_bn, unit, category, hs_code, description, image_url, is_active, track_inventory, sale_price, cost_price, tax_rule_id, reorder_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
    );
    prodStmt.run(
      'TEX-101',
      '890101001011',
      'Bengal Loom',
      'Combed Cotton Poplin (40m Roll)',
      'কটন পপলিন কাপড় (৪০ মিটার রোল)',
      'roll',
      'Textiles',
      '5208.11',
      '100% combed cotton poplin weave, 44-inch width, 40m export-grade roll.',
      '/src/assets/images/product_cotton_poplin_1795659038539.jpg',
      1,
      6800,
      4800,
      1,
      5
    );
    prodStmt.run(
      'TEX-102',
      '890101001028',
      'Bengal Loom',
      'Raw Linen Fabric Bolt',
      'লিনেন ফেব্রিক বোল্ট',
      'bolt',
      'Textiles',
      '5309.19',
      'Unbleached natural oatmeal slub linen bolt suitable for apparel & home textiles.',
      '/src/assets/images/product_raw_linen_1795659040000.jpg',
      1,
      9500,
      6900,
      1,
      4
    );
    prodStmt.run(
      'HRD-201',
      '890201002015',
      'YKK Industrial',
      'Heavy-Duty Brass Zippers (Box 100)',
      'ব্রাস জিপার (১০০ পিস বক্স)',
      'box',
      'Accessories',
      '9607.11',
      'No. 5 antique brass auto-lock metal zippers, 100-piece factory pack.',
      '/src/assets/images/product_brass_zippers_1795659038682.jpg',
      1,
      2400,
      1550,
      2,
      10
    );
    prodStmt.run(
      'HRD-202',
      '890201002022',
      'Coats Astra',
      'Industrial Thread Cone Pack',
      'ইন্ডাস্ট্রিয়াল সুতার কোন প্যাক',
      'pack',
      'Accessories',
      '5401.10',
      'High-tensile 40/2 spun polyester industrial sewing thread cones (pack of 6).',
      '/src/assets/images/product_thread_cones_1795659039569.jpg',
      1,
      1450,
      920,
      3,
      12
    );
    prodStmt.run(
      'SRV-301',
      '890301003012',
      'Dhaka Trade',
      'Monthly B2B Supply Retainer',
      'মাসিক বিটুবি সাপ্লাই রিটেইনার',
      'month',
      'Services',
      '9983.11',
      'Dedicated monthly B2B procurement, quality inspection & priority logistics service.',
      '',
      0,
      18000,
      0,
      1,
      0
    );
  });

  tx();

  const customers = db.prepare('SELECT id, code FROM customers').all() as { id: number; code: string }[];
  const vendors = db.prepare('SELECT id, code FROM vendors').all() as { id: number; code: string }[];
  const products = db.prepare('SELECT id, sku FROM products').all() as { id: number; sku: string }[];

  const cMap = Object.fromEntries(customers.map((c) => [c.code, c.id]));
  const vMap = Object.fromEntries(vendors.map((v) => [v.code, v.id]));
  const pMap = Object.fromEntries(products.map((p) => [p.sku, p.id]));

  // 5. Purchases (adds real stock to DHK & CTG + Mushak 6.1 Input VAT)
  createPurchaseTransaction(
    db,
    {
      branchId: 1,
      vendorId: vMap['VEND-001'],
      purchaseDate: '2026-11-02',
      mushak61Ref: 'M61-2026-00104',
      payImmediately: true,
      paymentMethod: 'bank',
      notes: 'Initial November fabric restock — Gulshan Warehouse',
      items: [
        { productId: pMap['TEX-101'], quantity: 18, unitCost: 4800, vatRate: 15 },
        { productId: pMap['TEX-102'], quantity: 10, unitCost: 6900, vatRate: 15 },
      ],
    },
    actor
  );

  createPurchaseTransaction(
    db,
    {
      branchId: 1,
      vendorId: vMap['VEND-002'],
      purchaseDate: '2026-11-04',
      mushak61Ref: 'M61-2026-00112',
      payImmediately: false,
      notes: 'Accessories procurement (Net 30)',
      items: [
        { productId: pMap['HRD-201'], quantity: 20, unitCost: 1550, vatRate: 7.5 },
        { productId: pMap['HRD-202'], quantity: 14, unitCost: 920, vatRate: 5 },
      ],
    },
    actor
  );

  createPurchaseTransaction(
    db,
    {
      branchId: 2,
      vendorId: vMap['VEND-001'],
      purchaseDate: '2026-11-05',
      mushak61Ref: 'M61-CTG-00018',
      payImmediately: true,
      paymentMethod: 'bank',
      notes: 'Chattogram Agrabad branch opening stock',
      items: [
        { productId: pMap['TEX-101'], quantity: 8, unitCost: 4850, vatRate: 15 },
        { productId: pMap['HRD-201'], quantity: 6, unitCost: 1550, vatRate: 7.5 },
      ],
    },
    actor
  );

  // 6. Invoices (Posts Sales, Output VAT Mushak 6.3, COGS & Receivables)
  const inv1 = createInvoiceTransaction(
    db,
    {
      branchId: 1,
      customerId: cMap['CUST-001'],
      issueDate: '2026-11-08',
      dueDate: '2026-11-18', // Overdue for realistic alert
      notes: 'Urgent export batch — Uttara factory delivery',
      items: [
        {
          productId: pMap['TEX-101'],
          description: 'Combed Cotton Poplin (40m Roll)',
          quantity: 6,
          unitPrice: 6800,
          taxRuleId: 1,
          taxRate: 15,
        },
        {
          productId: pMap['HRD-201'],
          description: 'Heavy-Duty Brass Zippers (Box 100)',
          quantity: 8,
          unitPrice: 2400,
          taxRuleId: 2,
          taxRate: 7.5,
        },
      ],
    },
    actor
  );

  const inv2 = createInvoiceTransaction(
    db,
    {
      branchId: 1,
      customerId: cMap['CUST-002'],
      issueDate: '2026-11-12',
      dueDate: '2026-11-28',
      notes: 'Boutique winter line fabric supply',
      items: [
        {
          productId: pMap['TEX-102'],
          description: 'Raw Linen Fabric Bolt',
          quantity: 4,
          unitPrice: 9500,
          taxRuleId: 1,
          taxRate: 15,
        },
        {
          productId: pMap['HRD-202'],
          description: 'Industrial Thread Cone Pack',
          quantity: 5,
          unitPrice: 1450,
          taxRuleId: 3,
          taxRate: 5,
        },
      ],
    },
    actor
  );

  createInvoiceTransaction(
    db,
    {
      branchId: 2,
      customerId: cMap['CUST-003'],
      issueDate: '2026-11-19',
      dueDate: '2026-12-05',
      notes: 'Chattogram Agrabad dispatch',
      items: [
        {
          productId: pMap['TEX-101'],
          description: 'Combed Cotton Poplin (40m Roll)',
          quantity: 3,
          unitPrice: 6800,
          taxRuleId: 1,
          taxRate: 15,
        },
      ],
    },
    actor
  );

  // 7. POS Quick Cash Counter Sale
  createInvoiceTransaction(
    db,
    {
      branchId: 1,
      customerId: cMap['CUST-004'],
      issueDate: '2026-11-22',
      dueDate: '2026-11-22',
      source: 'pos',
      notes: 'Gulshan POS Counter Quick Sale',
      items: [
        {
          productId: pMap['HRD-202'],
          description: 'Industrial Thread Cone Pack',
          quantity: 4,
          unitPrice: 1450,
          taxRuleId: 3,
          taxRate: 5,
        },
      ],
      immediatePayment: {
        amount: 6090,
        method: 'bkash',
        gatewayProvider: 'bKash Merchant',
        gatewayReference: 'BKS9A821K4',
      },
    },
    actor
  );

  // 8. Payments (Partial on inv1, Full via SSLCommerz on inv2)
  recordPaymentTransaction(
    db,
    {
      customerId: cMap['CUST-001'],
      branchId: 1,
      paymentDate: '2026-11-14',
      amount: 35000,
      method: 'bank',
      gatewayProvider: 'BEFTN / Prime Bank',
      gatewayReference: 'PRB-20261114-882',
      invoiceId: inv1.id,
      notes: 'First installment via bank transfer',
    },
    actor
  );

  recordPaymentTransaction(
    db,
    {
      customerId: cMap['CUST-002'],
      branchId: 1,
      paymentDate: '2026-11-16',
      amount: inv2.grandTotal,
      method: 'sslcommerz',
      gatewayProvider: 'SSLCommerz Checkout',
      gatewayReference: 'SSLCZ-TXN-774921',
      invoiceId: inv2.id,
      notes: 'Paid online via SSLCommerz invoice link',
    },
    actor
  );

  // 9. Operating Expenses
  createExpenseTransaction(
    db,
    {
      branchId: 1,
      expenseDate: '2026-11-05',
      category: 'Warehouse & Office Rent',
      accountCode: '5100',
      vendorName: 'Gulshan Commercial Estates',
      amount: 35000,
      vatAmount: 0,
      paymentMethod: 'bank',
      reference: 'RENT-NOV-2026',
      notes: 'November 2026 showroom & storage rent',
    },
    actor
  );

  createExpenseTransaction(
    db,
    {
      branchId: 1,
      expenseDate: '2026-11-15',
      category: 'Utilities & Fiber Internet',
      accountCode: '5200',
      vendorName: 'DESCO & AmberIT',
      amount: 6500,
      vatAmount: 325,
      paymentMethod: 'nagad',
      reference: 'NGD-441029',
      notes: 'Monthly electricity & fiber broadband',
    },
    actor
  );

  // 10. Recurring Billing Profile
  const recItems: InvoiceLineInput[] = [
    {
      productId: pMap['SRV-301'],
      description: 'Monthly B2B Supply Retainer',
      quantity: 1,
      unitPrice: 18000,
      taxRuleId: 1,
      taxRate: 15,
    },
  ];
  const recTotals = computeInvoiceTotals(recItems, 'exclusive');
  db.prepare(
    `INSERT INTO recurring_profiles (title, customer_id, branch_id, frequency, next_run_date, last_run_date, status, auto_send, items_json, estimated_total)
     VALUES (?, ?, ?, 'monthly', '2026-11-24', '2026-10-24', 'active', 1, ?, ?)`
  ).run('Padma Apparel Monthly Retainer', cMap['CUST-001'], 1, JSON.stringify(recItems), recTotals.grandTotal);
}

/**
 * Resets all transactional & party tables cleanly for testing genuine Empty States.
 */
export function resetToCleanWorkspace(db: Database.Database, actor: ActorContext): void {
  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM idempotency_keys;
      DELETE FROM documents;
      DELETE FROM payment_allocations;
      DELETE FROM payments;
      DELETE FROM invoice_items;
      DELETE FROM invoices;
      DELETE FROM purchase_items;
      DELETE FROM purchases;
      DELETE FROM expenses;
      DELETE FROM recurring_profiles;
      DELETE FROM stock_movements;
      DELETE FROM branch_stock;
      DELETE FROM journal_lines;
      DELETE FROM journal_entries;
      DELETE FROM products;
      DELETE FROM customers;
      DELETE FROM vendors;
      DELETE FROM audit_logs;
    `);
    writeAuditLog(db, actor, 'WORKSPACE_RESET', 'organization', 1, 'Cleared transactional records to start clean workspace');
  });
  tx();
}

export function listAllWorkspaceData(db: Database.Database, branchId?: number) {
  const organization = getOrganization(db);
  const branches = db
    .prepare(
      'SELECT id, code, name, name_bn as nameBn, address, phone, is_main as isMain, is_active as isActive FROM branches ORDER BY is_main DESC, id ASC'
    )
    .all() as Branch[];
  const taxRules = db
    .prepare(
      `SELECT id, code, name, name_bn as nameBn, rate, sd_rate as sdRate, mushak_category as mushakCategory,
              effective_from as effectiveFrom, effective_to as effectiveTo, is_default as isDefault, is_active as isActive
       FROM tax_rules ORDER BY is_default DESC, rate DESC`
    )
    .all() as TaxRule[];
  const accounts = db
    .prepare('SELECT id, code, name, name_bn as nameBn, type, is_system as isSystem FROM accounts ORDER BY code ASC')
    .all() as Account[];
  const customers = listCustomersWithBalances(db);
  const vendors = db
    .prepare(
      `SELECT v.*, COALESCE((SELECT SUM(grand_total - paid_amount) FROM purchases WHERE vendor_id = v.id AND status != 'void'), 0) as payable_balance
       FROM vendors v ORDER BY v.id DESC`
    )
    .all()
    .map((r: unknown) => {
      const row = r as Record<string, unknown>;
      return {
        id: Number(row.id),
        code: String(row.code),
        name: String(row.name),
        companyName: String(row.company_name || ''),
        phone: String(row.phone || ''),
        email: String(row.email || ''),
        binNumber: String(row.bin_number || ''),
        address: String(row.address || ''),
        payableBalance: roundMoney(Number(row.payable_balance || 0)),
        createdAt: String(row.created_at),
      } as Vendor;
    });

  const products = listProductsWithStock(db, branchId);

  const invoiceIds = (branchId
    ? db.prepare('SELECT id FROM invoices WHERE branch_id = ? ORDER BY issue_date DESC, id DESC').all(branchId)
    : db.prepare('SELECT id FROM invoices ORDER BY issue_date DESC, id DESC').all()) as { id: number }[];
  const invoices = invoiceIds.map((r) => getInvoiceById(db, r.id)!).filter(Boolean);

  const paymentRows = (branchId
    ? db
        .prepare(
          `SELECT p.*, c.name as customer_name FROM payments p
           INNER JOIN customers c ON c.id = p.customer_id
           WHERE p.branch_id = ? ORDER BY p.payment_date DESC, p.id DESC`
        )
        .all(branchId)
    : db
        .prepare(
          `SELECT p.*, c.name as customer_name FROM payments p
           INNER JOIN customers c ON c.id = p.customer_id
           ORDER BY p.payment_date DESC, p.id DESC`
        )
        .all()) as Record<string, unknown>[];

  const payments: Payment[] = paymentRows.map((p) => {
    const allocs = db
      .prepare(
        `SELECT pa.invoice_id as invoiceId, i.invoice_number as invoiceNumber, pa.amount
         FROM payment_allocations pa INNER JOIN invoices i ON i.id = pa.invoice_id
         WHERE pa.payment_id = ?`
      )
      .all(Number(p.id)) as { invoiceId: number; invoiceNumber: string; amount: number }[];
    return {
      id: Number(p.id),
      paymentNumber: String(p.payment_number),
      customerId: Number(p.customer_id),
      customerName: String(p.customer_name),
      branchId: Number(p.branch_id),
      paymentDate: String(p.payment_date),
      amount: Number(p.amount),
      method: p.method as PaymentMethod,
      gatewayProvider: p.gateway_provider ? String(p.gateway_provider) : null,
      gatewayReference: p.gateway_reference ? String(p.gateway_reference) : null,
      notes: String(p.notes || ''),
      journalEntryId: p.journal_entry_id ? Number(p.journal_entry_id) : null,
      allocations: allocs,
      createdAt: String(p.created_at),
    };
  });

  const purchases = (branchId
    ? db
        .prepare(
          `SELECT p.*, v.name as vendor_name, b.name as branch_name FROM purchases p
           INNER JOIN vendors v ON v.id = p.vendor_id
           INNER JOIN branches b ON b.id = p.branch_id
           WHERE p.branch_id = ? ORDER BY p.purchase_date DESC, p.id DESC`
        )
        .all(branchId)
    : db
        .prepare(
          `SELECT p.*, v.name as vendor_name, b.name as branch_name FROM purchases p
           INNER JOIN vendors v ON v.id = p.vendor_id
           INNER JOIN branches b ON b.id = p.branch_id
           ORDER BY p.purchase_date DESC, p.id DESC`
        )
        .all()
  ).map((r: unknown) => {
    const row = r as Record<string, unknown>;
    const pid = Number(row.id);
    const items = db
      .prepare(
        `SELECT id, product_id as productId, quantity, unit_cost as unitCost,
                vat_rate as vatRate, vat_amount as vatAmount, line_total as lineTotal
         FROM purchase_items WHERE purchase_id = ?`
      )
      .all(pid) as Purchase['items'];
    return {
      id: pid,
      billNumber: String(row.bill_number),
      mushak61Ref: String(row.mushak_61_ref || ''),
      branchId: Number(row.branch_id),
      branchName: String(row.branch_name),
      vendorId: Number(row.vendor_id),
      vendorName: String(row.vendor_name),
      purchaseDate: String(row.purchase_date),
      subtotal: Number(row.subtotal),
      vatTotal: Number(row.vat_total),
      grandTotal: Number(row.grand_total),
      paidAmount: Number(row.paid_amount),
      status: row.status as Purchase['status'],
      journalEntryId: row.journal_entry_id ? Number(row.journal_entry_id) : null,
      notes: String(row.notes || ''),
      createdAt: String(row.created_at),
      items,
    };
  });

  const expenses = (branchId
    ? db
        .prepare(
          `SELECT e.*, b.name as branch_name FROM expenses e
           INNER JOIN branches b ON b.id = e.branch_id
           WHERE e.branch_id = ? ORDER BY e.expense_date DESC, e.id DESC`
        )
        .all(branchId)
    : db
        .prepare(
          `SELECT e.*, b.name as branch_name FROM expenses e
           INNER JOIN branches b ON b.id = e.branch_id
           ORDER BY e.expense_date DESC, e.id DESC`
        )
        .all()
  ).map((r: unknown) => {
    const row = r as Record<string, unknown>;
    return {
      id: Number(row.id),
      expenseNumber: String(row.expense_number),
      branchId: Number(row.branch_id),
      branchName: String(row.branch_name),
      expenseDate: String(row.expense_date),
      category: String(row.category),
      accountCode: String(row.account_code),
      vendorName: String(row.vendor_name || ''),
      amount: Number(row.amount),
      vatAmount: Number(row.vat_amount),
      totalAmount: Number(row.total_amount),
      paymentMethod: row.payment_method as PaymentMethod,
      reference: String(row.reference || ''),
      notes: String(row.notes || ''),
      journalEntryId: row.journal_entry_id ? Number(row.journal_entry_id) : null,
      createdAt: String(row.created_at),
    };
  });

  const journalRows = (branchId
    ? db
        .prepare('SELECT * FROM journal_entries WHERE branch_id = ? ORDER BY entry_date DESC, id DESC LIMIT 100')
        .all(branchId)
    : db.prepare('SELECT * FROM journal_entries ORDER BY entry_date DESC, id DESC LIMIT 100').all()) as Record<
    string,
    unknown
  >[];

  const journals: JournalEntry[] = journalRows.map((je) => {
    const lines = db
      .prepare(
        `SELECT jl.id, jl.account_id as accountId, a.code as accountCode, a.name as accountName,
                a.type as accountType, jl.debit, jl.credit, jl.memo
         FROM journal_lines jl INNER JOIN accounts a ON a.id = jl.account_id
         WHERE jl.journal_entry_id = ?`
      )
      .all(Number(je.id)) as JournalLine[];

    return {
      id: Number(je.id),
      entryNumber: String(je.entry_number),
      entryDate: String(je.entry_date),
      branchId: Number(je.branch_id),
      sourceType: String(je.source_type),
      sourceId: je.source_id ? Number(je.source_id) : null,
      description: String(je.description),
      status: je.status as 'posted' | 'reversed',
      reversalOfId: je.reversal_of_id ? Number(je.reversal_of_id) : null,
      createdBy: String(je.created_by),
      createdAt: String(je.created_at),
      lines,
    };
  });

  const recurringProfiles: RecurringProfile[] = (
    db
      .prepare(
        `SELECT r.*, c.name as customer_name FROM recurring_profiles r
         INNER JOIN customers c ON c.id = r.customer_id ORDER BY r.next_run_date ASC`
      )
      .all() as Record<string, unknown>[]
  ).map((r) => ({
    id: Number(r.id),
    title: String(r.title),
    customerId: Number(r.customer_id),
    customerName: String(r.customer_name),
    branchId: Number(r.branch_id),
    frequency: r.frequency as RecurringFrequency,
    nextRunDate: String(r.next_run_date),
    lastRunDate: r.last_run_date ? String(r.last_run_date) : null,
    status: r.status as 'active' | 'paused',
    autoSend: Boolean(r.auto_send),
    items: JSON.parse(String(r.items_json || '[]')),
    estimatedTotal: Number(r.estimated_total),
  }));

  const documents = db
    .prepare(
      `SELECT id, doc_type as docType, reference_number as referenceNumber, entity_type as entityType,
              entity_id as entityId, title, party_name as partyName, amount, issued_at as issuedAt
       FROM documents ORDER BY id DESC LIMIT 120`
    )
    .all() as DocumentRecord[];

  const auditLogs = db
    .prepare(
      `SELECT id, actor_name as actorName, actor_role as actorRole, action,
              entity_type as entityType, entity_id as entityId, summary, created_at as createdAt
       FROM audit_logs ORDER BY id DESC LIMIT 100`
    )
    .all() as AuditLog[];

  const users = db
    .prepare(
      `SELECT id, name, email, role, branch_id as branchId, is_active as isActive, created_at as createdAt
       FROM users ORDER BY id ASC`
    )
    .all();

  const reports = computeReportsFromLedger(db, branchId);
  const alerts = computeSystemAlerts(db, branchId);

  return {
    organization,
    branches,
    taxRules,
    accounts,
    customers,
    vendors,
    products,
    invoices,
    payments,
    purchases,
    expenses,
    journals,
    recurringProfiles,
    documents,
    auditLogs,
    users,
    reports,
    alerts,
  };
}

// ============================================================================
// Universal Accounting-Safe Edit & Delete Operations (All 11 Entities)
// ============================================================================

function safeReverseIfPosted(
  db: Database.Database,
  journalEntryId: number | null | undefined,
  reason: string,
  actor: ActorContext
): number | null {
  if (!journalEntryId) return null;
  const row = db
    .prepare('SELECT id, status FROM journal_entries WHERE id = ?')
    .get(journalEntryId) as { id: number; status: string } | undefined;
  if (!row || row.status !== 'posted') return null;
  const res = reverseJournalEntry(db, row.id, reason, actor);
  return res.reversalJournalId;
}

function restoreBranchStockFromSale(
  db: Database.Database,
  branchId: number,
  productId: number,
  qty: number,
  unitCost: number,
  sourceId: number,
  notes: string
): void {
  if (qty <= 0) return;
  const stockRow = db
    .prepare('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?')
    .get(branchId, productId) as
    | { id: number; quantity: number; avg_cost: number; fifo_lots_json: string }
    | undefined;

  const currentQty = stockRow ? Number(stockRow.quantity) : 0;
  const currentAvg = stockRow ? Number(stockRow.avg_cost) : unitCost;
  const lots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];
  const next = computeWeightedAvgStockIn(currentQty, currentAvg, qty, unitCost);
  const nextLots: StockLot[] = [...lots, { qty, unitCost }];

  if (stockRow) {
    db.prepare('UPDATE branch_stock SET quantity = ?, avg_cost = ?, fifo_lots_json = ? WHERE id = ?').run(
      next.newQty,
      next.newAvgCost,
      JSON.stringify(nextLots),
      stockRow.id
    );
  } else {
    db.prepare(
      'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)'
    ).run(branchId, productId, next.newQty, next.newAvgCost, JSON.stringify(nextLots));
  }

  db.prepare(
    `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
     VALUES (?, ?, 'in', ?, ?, ?, 'invoice_reversal', ?, ?, ?)`
  ).run(branchId, productId, qty, unitCost, roundMoney(qty * unitCost), sourceId, todayISO(), notes);
}

// 1. Customers
export function updateCustomerRecord(
  db: Database.Database,
  customerId: number,
  input: {
    name?: string;
    companyName?: string;
    phone?: string;
    email?: string;
    binNumber?: string;
    address?: string;
    openingBalance?: number;
    creditLimit?: number;
  },
  actor: ActorContext
): { id: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, name FROM customers WHERE id = ?').get(customerId) as
      | { id: number; name: string }
      | undefined;
    if (!existing) throw new Error('Customer not found.');
    const nextName = String(input.name ?? existing.name).trim();
    if (!nextName) throw new Error('Customer name is required.');

    db.prepare(
      `UPDATE customers SET
        name = ?,
        company_name = COALESCE(?, company_name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        bin_number = COALESCE(?, bin_number),
        address = COALESCE(?, address),
        opening_balance = COALESCE(?, opening_balance),
        credit_limit = COALESCE(?, credit_limit)
       WHERE id = ?`
    ).run(
      nextName,
      input.companyName !== undefined ? String(input.companyName).trim() : null,
      input.phone !== undefined ? String(input.phone).trim() : null,
      input.email !== undefined ? String(input.email).trim() : null,
      input.binNumber !== undefined ? String(input.binNumber).trim() : null,
      input.address !== undefined ? String(input.address).trim() : null,
      input.openingBalance !== undefined && Number.isFinite(Number(input.openingBalance))
        ? Number(input.openingBalance)
        : null,
      input.creditLimit !== undefined && Number.isFinite(Number(input.creditLimit))
        ? Math.max(0, Number(input.creditLimit))
        : null,
      customerId
    );

    writeAuditLog(db, actor, 'CUSTOMER_UPDATED', 'customer', customerId, `Updated customer ${nextName}`);
    return { id: customerId };
  });
  return tx();
}

export function deleteCustomerRecord(
  db: Database.Database,
  customerId: number,
  actor: ActorContext
): { deletedId: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, name, code FROM customers WHERE id = ?').get(customerId) as
      | { id: number; name: string; code: string }
      | undefined;
    if (!existing) throw new Error('Customer not found.');

    const invCount = (
      db.prepare('SELECT COUNT(*) as c FROM invoices WHERE customer_id = ?').get(customerId) as { c: number }
    ).c;
    const payCount = (
      db.prepare('SELECT COUNT(*) as c FROM payments WHERE customer_id = ?').get(customerId) as { c: number }
    ).c;
    const recCount = (
      db.prepare('SELECT COUNT(*) as c FROM recurring_profiles WHERE customer_id = ?').get(customerId) as {
        c: number;
      }
    ).c;
    if (invCount > 0 || payCount > 0 || recCount > 0) {
      throw new Error(
        `Cannot delete customer "${existing.name}" because ${invCount} invoice(s), ${payCount} payment(s), and ${recCount} recurring schedule(s) are linked. Delete those records first.`
      );
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
    writeAuditLog(
      db,
      actor,
      'CUSTOMER_DELETED',
      'customer',
      customerId,
      `Deleted customer ${existing.name} (${existing.code})`
    );
    return { deletedId: customerId };
  });
  return tx();
}

// 2. Vendors
export function updateVendorRecord(
  db: Database.Database,
  vendorId: number,
  input: {
    name?: string;
    companyName?: string;
    phone?: string;
    email?: string;
    binNumber?: string;
    address?: string;
  },
  actor: ActorContext
): { id: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, name FROM vendors WHERE id = ?').get(vendorId) as
      | { id: number; name: string }
      | undefined;
    if (!existing) throw new Error('Vendor not found.');
    const nextName = String(input.name ?? existing.name).trim();
    if (!nextName) throw new Error('Vendor name is required.');

    db.prepare(
      `UPDATE vendors SET
        name = ?,
        company_name = COALESCE(?, company_name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        bin_number = COALESCE(?, bin_number),
        address = COALESCE(?, address)
       WHERE id = ?`
    ).run(
      nextName,
      input.companyName !== undefined ? String(input.companyName).trim() : null,
      input.phone !== undefined ? String(input.phone).trim() : null,
      input.email !== undefined ? String(input.email).trim() : null,
      input.binNumber !== undefined ? String(input.binNumber).trim() : null,
      input.address !== undefined ? String(input.address).trim() : null,
      vendorId
    );

    writeAuditLog(db, actor, 'VENDOR_UPDATED', 'vendor', vendorId, `Updated vendor ${nextName}`);
    return { id: vendorId };
  });
  return tx();
}

export function deleteVendorRecord(
  db: Database.Database,
  vendorId: number,
  actor: ActorContext
): { deletedId: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, name, code FROM vendors WHERE id = ?').get(vendorId) as
      | { id: number; name: string; code: string }
      | undefined;
    if (!existing) throw new Error('Vendor not found.');

    const purCount = (
      db.prepare('SELECT COUNT(*) as c FROM purchases WHERE vendor_id = ?').get(vendorId) as { c: number }
    ).c;
    if (purCount > 0) {
      throw new Error(
        `Cannot delete vendor "${existing.name}" because ${purCount} purchase bill(s) reference this vendor. Delete those purchases first.`
      );
    }

    db.prepare('DELETE FROM vendors WHERE id = ?').run(vendorId);
    writeAuditLog(
      db,
      actor,
      'VENDOR_DELETED',
      'vendor',
      vendorId,
      `Deleted vendor ${existing.name} (${existing.code})`
    );
    return { deletedId: vendorId };
  });
  return tx();
}

// 3. Products
export function deleteProductRecord(
  db: Database.Database,
  productId: number,
  actor: ActorContext
): { deletedId: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, sku, name FROM products WHERE id = ?').get(productId) as
      | { id: number; sku: string; name: string }
      | undefined;
    if (!existing) throw new Error('Product not found.');

    const invCount = (
      db.prepare('SELECT COUNT(*) as c FROM invoice_items WHERE product_id = ?').get(productId) as { c: number }
    ).c;
    const purCount = (
      db.prepare('SELECT COUNT(*) as c FROM purchase_items WHERE product_id = ?').get(productId) as { c: number }
    ).c;
    if (invCount > 0 || purCount > 0) {
      throw new Error(
        `Cannot delete product "${existing.name}" (${existing.sku}) because it is referenced in ${invCount} invoice line(s) and ${purCount} purchase line(s). Delete those transactions first.`
      );
    }

    db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(productId);
    db.prepare('DELETE FROM branch_stock WHERE product_id = ?').run(productId);
    db.prepare('DELETE FROM products WHERE id = ?').run(productId);

    writeAuditLog(
      db,
      actor,
      'PRODUCT_DELETED',
      'product',
      productId,
      `Deleted product ${existing.name} (${existing.sku})`
    );
    return { deletedId: productId };
  });
  return tx();
}

// 4. Invoices (Edit & Delete with Auto-Reversal + Stock Restoration)
export function deleteInvoiceTransaction(
  db: Database.Database,
  invoiceId: number,
  actor: ActorContext
): { deletedId: number; reversedJournalId: number | null } {
  const tx = db.transaction(() => {
    const inv = db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(invoiceId) as Record<string, unknown> | undefined;
    if (!inv) throw new Error('Invoice not found.');

    const invoiceNumber = String(inv.invoice_number);
    const branchId = Number(inv.branch_id);

    // Check payment allocations linked to this invoice
    const allocations = db
      .prepare('SELECT payment_id, amount FROM payment_allocations WHERE invoice_id = ?')
      .all(invoiceId) as { payment_id: number; amount: number }[];

    for (const alloc of allocations) {
      const otherAllocs = (
        db
          .prepare('SELECT COUNT(*) as c FROM payment_allocations WHERE payment_id = ? AND invoice_id != ?')
          .get(alloc.payment_id, invoiceId) as { c: number }
      ).c;
      if (otherAllocs > 0) {
        const payRow = db
          .prepare('SELECT payment_number FROM payments WHERE id = ?')
          .get(alloc.payment_id) as { payment_number: string } | undefined;
        throw new Error(
          `Invoice ${invoiceNumber} shares payment ${payRow?.payment_number || '#' + alloc.payment_id} with another invoice. Delete that payment first.`
        );
      }
      // Exclusive payment (e.g. POS immediate payment or single-invoice settlement): reverse and delete cleanly
      const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(alloc.payment_id) as
        | { id: number; payment_number: string; journal_entry_id: number | null }
        | undefined;
      if (pay) {
        safeReverseIfPosted(
          db,
          pay.journal_entry_id,
          `Auto-reversal of ${pay.payment_number} on delete of ${invoiceNumber}`,
          actor
        );
        db.prepare("DELETE FROM documents WHERE entity_type = 'payment' AND entity_id = ?").run(pay.id);
        db.prepare('DELETE FROM payments WHERE id = ?').run(pay.id);
      }
    }

    // Reverse invoice double-entry journal (reverses AR, Revenue, Output VAT, SD, COGS, Inventory)
    const reversedJournalId = safeReverseIfPosted(
      db,
      inv.journal_entry_id ? Number(inv.journal_entry_id) : null,
      `Auto-reversal on delete of invoice ${invoiceNumber}`,
      actor
    );

    // Restore branch stock from recorded sale stock movements
    const saleMoves = db
      .prepare(
        `SELECT product_id, quantity, unit_cost FROM stock_movements
         WHERE source_type = 'invoice' AND source_id = ? AND movement_type = 'out'`
      )
      .all(invoiceId) as { product_id: number; quantity: number; unit_cost: number }[];

    for (const mv of saleMoves) {
      restoreBranchStockFromSale(
        db,
        branchId,
        mv.product_id,
        Number(mv.quantity),
        Number(mv.unit_cost),
        invoiceId,
        `Stock restored on delete of ${invoiceNumber}`
      );
    }

    db.prepare("DELETE FROM documents WHERE entity_type = 'invoice' AND entity_id = ?").run(invoiceId);
    db.prepare('DELETE FROM invoices WHERE id = ?').run(invoiceId);

    writeAuditLog(
      db,
      actor,
      'INVOICE_DELETED',
      'invoice',
      invoiceId,
      `Deleted invoice ${invoiceNumber} with automatic double-entry reversal & stock restoration`
    );

    return { deletedId: invoiceId, reversedJournalId };
  });
  return tx();
}

export function updateInvoiceTransaction(
  db: Database.Database,
  invoiceId: number,
  input: {
    branchId: number;
    customerId: number;
    issueDate: string;
    dueDate: string;
    notes?: string;
    items: InvoiceLineInput[];
  },
  actor: ActorContext
): Invoice {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) throw new Error('Invoice not found.');
    if (!input.items || input.items.length === 0) {
      throw new Error('Invoice must include at least one line item.');
    }

    const customer = db
      .prepare('SELECT id, name FROM customers WHERE id = ?')
      .get(input.customerId) as { id: number; name: string } | undefined;
    if (!customer) throw new Error('Customer not found.');

    const org = getOrganization(db);
    const computed = computeInvoiceTotals(input.items, org.vatMode);
    const existingPaid = roundMoney(Number(existing.paid_amount));
    if (computed.grandTotal + 0.005 < existingPaid) {
      throw new Error(
        `Updated invoice total (${computed.grandTotal}) cannot be lower than already collected amount (${existingPaid}).`
      );
    }

    const invoiceNumber = String(existing.invoice_number);
    const oldBranchId = Number(existing.branch_id);

    // 1. Reverse previous posted journal entry so ledger stays immutable and balanced
    safeReverseIfPosted(
      db,
      existing.journal_entry_id ? Number(existing.journal_entry_id) : null,
      `Auto-reversal for edit of ${invoiceNumber}`,
      actor
    );

    // 2. Restore previously deducted stock from old branch
    const oldMoves = db
      .prepare(
        `SELECT product_id, quantity, unit_cost FROM stock_movements
         WHERE source_type = 'invoice' AND source_id = ? AND movement_type = 'out'`
      )
      .all(invoiceId) as { product_id: number; quantity: number; unit_cost: number }[];
    for (const mv of oldMoves) {
      restoreBranchStockFromSale(
        db,
        oldBranchId,
        mv.product_id,
        Number(mv.quantity),
        Number(mv.unit_cost),
        invoiceId,
        `Stock restored before edit of ${invoiceNumber}`
      );
    }
    // Tag old 'invoice' out movements so subsequent edits don't double-restore them
    db.prepare(
      `UPDATE stock_movements SET source_type = 'invoice_superseded'
       WHERE source_type = 'invoice' AND source_id = ? AND movement_type = 'out'`
    ).run(invoiceId);

    // 3. Replace invoice_items and deduct new stock & compute COGS
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoiceId);
    const insertItem = db.prepare(
      `INSERT INTO invoice_items (
        invoice_id, product_id, description, quantity, unit_price, discount_amount,
        tax_rule_id, tax_rate, sd_rate, taxable_value, sd_amount, vat_amount, line_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let totalCogs = 0;
    for (const line of computed.lines) {
      insertItem.run(
        invoiceId,
        line.productId ?? null,
        line.description.trim(),
        line.quantity,
        line.unitPrice,
        line.discountAmount,
        line.taxRuleId ?? null,
        line.taxRate,
        line.sdRate,
        line.taxableValue,
        line.sdAmount,
        line.vatAmount,
        line.lineTotal
      );

      if (line.productId) {
        const prod = db
          .prepare('SELECT id, track_inventory, cost_price FROM products WHERE id = ?')
          .get(line.productId) as { id: number; track_inventory: number; cost_price: number } | undefined;
        if (prod && prod.track_inventory) {
          const stockRow = db
            .prepare('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?')
            .get(input.branchId, prod.id) as
            | { id: number; quantity: number; avg_cost: number; fifo_lots_json: string }
            | undefined;

          const currentQty = stockRow ? Number(stockRow.quantity) : 0;
          const currentAvg = stockRow ? Number(stockRow.avg_cost) : Number(prod.cost_price);
          const fifoLots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];

          const cogsResult = computeStockOutCOGS({
            method: org.inventoryMethod,
            currentQty,
            currentAvgCost: currentAvg,
            soldQty: line.quantity,
            fifoLots,
          });
          totalCogs = roundMoney(totalCogs + cogsResult.cogsTotal);

          if (stockRow) {
            db.prepare('UPDATE branch_stock SET quantity = ?, fifo_lots_json = ? WHERE id = ?').run(
              cogsResult.remainingQty,
              JSON.stringify(cogsResult.remainingLots || []),
              stockRow.id
            );
          } else {
            db.prepare(
              'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)'
            ).run(input.branchId, prod.id, cogsResult.remainingQty, currentAvg, '[]');
          }

          db.prepare(
            `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
             VALUES (?, ?, 'out', ?, ?, ?, 'invoice', ?, ?, ?)`
          ).run(
            input.branchId,
            prod.id,
            line.quantity,
            cogsResult.effectiveUnitCost,
            cogsResult.cogsTotal,
            invoiceId,
            input.issueDate,
            `Updated invoice ${invoiceNumber}`
          );
        }
      }
    }

    // 4. Post fresh balanced double-entry journal
    const journalLines: JournalLine[] = [
      { accountCode: '1100', debit: computed.grandTotal, credit: 0, memo: `AR ${invoiceNumber} (edited) — ${customer.name}` },
      { accountCode: '4000', debit: 0, credit: computed.subtotal, memo: `Sales revenue ${invoiceNumber}` },
    ];
    if (computed.vatTotal > 0) {
      journalLines.push({ accountCode: '2100', debit: 0, credit: computed.vatTotal, memo: `Output VAT ${invoiceNumber}` });
    }
    if (computed.sdTotal > 0) {
      journalLines.push({ accountCode: '2110', debit: 0, credit: computed.sdTotal, memo: `SD ${invoiceNumber}` });
    }
    if (totalCogs > 0) {
      journalLines.push(
        { accountCode: '5000', debit: totalCogs, credit: 0, memo: `COGS ${invoiceNumber}` },
        { accountCode: '1200', debit: 0, credit: totalCogs, memo: `Inventory out ${invoiceNumber}` }
      );
    }

    const newJournalId = postJournalEntry(db, {
      entryDate: input.issueDate,
      branchId: input.branchId,
      sourceType: 'invoice',
      sourceId: invoiceId,
      description: `Invoice ${invoiceNumber} (Updated) · ${customer.name}`,
      lines: journalLines,
      actor,
    });

    const nextStatus = resolveInvoiceStatus({
      grandTotal: computed.grandTotal,
      paidAmount: existingPaid,
      dueDate: input.dueDate,
      today: todayISO(),
    });
    db.prepare(
      `UPDATE invoices SET
        branch_id = ?, customer_id = ?, issue_date = ?, due_date = ?, status = ?,
        subtotal = ?, discount_total = ?, sd_total = ?, vat_total = ?, grand_total = ?,
        notes = ?, journal_entry_id = ?
       WHERE id = ?`
    ).run(
      input.branchId,
      input.customerId,
      input.issueDate,
      input.dueDate,
      nextStatus,
      computed.subtotal,
      computed.discountTotal,
      computed.sdTotal,
      computed.vatTotal,
      computed.grandTotal,
      String(input.notes || '').trim(),
      newJournalId,
      invoiceId
    );

    db.prepare("UPDATE documents SET party_name = ?, amount = ? WHERE entity_type = 'invoice' AND entity_id = ?").run(
      customer.name,
      computed.grandTotal,
      invoiceId
    );

    writeAuditLog(
      db,
      actor,
      'INVOICE_UPDATED',
      'invoice',
      invoiceId,
      `Updated invoice ${invoiceNumber} for ${customer.name} (total ${computed.grandTotal}) with automatic journal re-posting`
    );

    return getInvoiceById(db, invoiceId)!;
  });
  return tx();
}

// 5. Payments (Edit & Delete with Auto-Reversal + Invoice Status Restore)
export function deletePaymentTransaction(
  db: Database.Database,
  paymentId: number,
  actor: ActorContext
): { deletedId: number; reversedJournalId: number | null } {
  const tx = db.transaction(() => {
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as
      | Record<string, unknown>
      | undefined;
    if (!pay) throw new Error('Payment not found.');

    const paymentNumber = String(pay.payment_number);
    const reversedJournalId = safeReverseIfPosted(
      db,
      pay.journal_entry_id ? Number(pay.journal_entry_id) : null,
      `Auto-reversal on delete of payment ${paymentNumber}`,
      actor
    );

    // Unwind allocations and restore linked invoice balances & statuses
    const allocs = db
      .prepare('SELECT invoice_id, amount FROM payment_allocations WHERE payment_id = ?')
      .all(paymentId) as { invoice_id: number; amount: number }[];

    const today = todayISO();
    for (const alloc of allocs) {
      const inv = db
        .prepare('SELECT id, grand_total, paid_amount, due_date FROM invoices WHERE id = ?')
        .get(alloc.invoice_id) as
        | { id: number; grand_total: number; paid_amount: number; due_date: string }
        | undefined;
      if (inv) {
        const nextPaid = Math.max(0, roundMoney(Number(inv.paid_amount) - Number(alloc.amount)));
        const nextStatus = resolveInvoiceStatus({
          grandTotal: Number(inv.grand_total),
          paidAmount: nextPaid,
          dueDate: inv.due_date,
          today,
        });
        db.prepare('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?').run(
          nextPaid,
          nextStatus,
          inv.id
        );
      }
    }

    db.prepare("DELETE FROM documents WHERE entity_type = 'payment' AND entity_id = ?").run(paymentId);
    db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);

    writeAuditLog(
      db,
      actor,
      'PAYMENT_DELETED',
      'payment',
      paymentId,
      `Deleted payment ${paymentNumber} (${pay.amount}) with automatic journal reversal and invoice balance restore`
    );
    return { deletedId: paymentId, reversedJournalId };
  });
  return tx();
}

export function updatePaymentTransaction(
  db: Database.Database,
  paymentId: number,
  input: {
    branchId?: number;
    paymentDate: string;
    amount: number;
    method: PaymentMethod;
    gatewayProvider?: string | null;
    gatewayReference?: string | null;
    notes?: string;
  },
  actor: ActorContext
): { id: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) throw new Error('Payment not found.');

    const nextAmount = roundMoney(Number(input.amount));
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const paymentNumber = String(existing.payment_number);
    const customerId = Number(existing.customer_id);
    const branchId = input.branchId ? Number(input.branchId) : Number(existing.branch_id);
    const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(customerId) as
      | { name: string }
      | undefined;

    // 1. Reverse old journal
    safeReverseIfPosted(
      db,
      existing.journal_entry_id ? Number(existing.journal_entry_id) : null,
      `Auto-reversal for edit of payment ${paymentNumber}`,
      actor
    );

    // 2. Unwind existing allocations
    const oldAllocs = db
      .prepare('SELECT invoice_id, amount FROM payment_allocations WHERE payment_id = ?')
      .all(paymentId) as { invoice_id: number; amount: number }[];
    const today = todayISO();
    const preferredInvoiceId = oldAllocs.length === 1 ? oldAllocs[0].invoice_id : null;

    for (const alloc of oldAllocs) {
      const inv = db
        .prepare('SELECT id, grand_total, paid_amount, due_date FROM invoices WHERE id = ?')
        .get(alloc.invoice_id) as
        | { id: number; grand_total: number; paid_amount: number; due_date: string }
        | undefined;
      if (inv) {
        const unwoundPaid = Math.max(0, roundMoney(Number(inv.paid_amount) - Number(alloc.amount)));
        const nextStatus = resolveInvoiceStatus({
          grandTotal: Number(inv.grand_total),
          paidAmount: unwoundPaid,
          dueDate: inv.due_date,
          today,
        });
        db.prepare('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?').run(
          unwoundPaid,
          nextStatus,
          inv.id
        );
      }
    }
    db.prepare('DELETE FROM payment_allocations WHERE payment_id = ?').run(paymentId);

    // 3. Re-allocate new amount across open invoices
    const openInvoices = db
      .prepare(
        `SELECT id, invoice_number as invoiceNumber, issue_date as issueDate, due_date as dueDate, grand_total as grandTotal, paid_amount as paidAmount
         FROM invoices WHERE customer_id = ? AND status != 'void' AND grand_total > paid_amount + 0.005
         ORDER BY issue_date ASC, id ASC`
      )
      .all(customerId) as {
      id: number;
      invoiceNumber: string;
      issueDate: string;
      dueDate: string;
      grandTotal: number;
      paidAmount: number;
    }[];

    const allocated = allocatePayment(
      nextAmount,
      openInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        balanceDue: roundMoney(inv.grandTotal - inv.paidAmount),
      })),
      preferredInvoiceId ?? undefined
    );
    const insertAlloc = db.prepare(
      'INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES (?, ?, ?)'
    );
    for (const item of allocated.allocations) {
      insertAlloc.run(paymentId, item.invoiceId, item.amount);
      const target = openInvoices.find((inv) => inv.id === item.invoiceId)!;
      const newPaid = roundMoney(target.paidAmount + item.amount);
      const newStatus = resolveInvoiceStatus({
        grandTotal: target.grandTotal,
        paidAmount: newPaid,
        dueDate: target.dueDate,
        today,
      });
      db.prepare('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?').run(
        newPaid,
        newStatus,
        item.invoiceId
      );
    }

    // 4. Post fresh balanced journal
    const cashAcc = paymentMethodToAccountCode(input.method);
    const newJournalId = postJournalEntry(db, {
      entryDate: input.paymentDate,
      branchId,
      sourceType: 'payment',
      sourceId: paymentId,
      description: `Payment ${paymentNumber} (Updated) · ${customer?.name || 'Customer'} via ${input.method.toUpperCase()}`,
      lines: [
        { accountCode: cashAcc, debit: nextAmount, credit: 0, memo: `${input.method.toUpperCase()} ${paymentNumber}` },
        { accountCode: '1100', debit: 0, credit: nextAmount, memo: `AR settlement ${paymentNumber}` },
      ],
      actor,
    });

    db.prepare(
      `UPDATE payments SET
        branch_id = ?, payment_date = ?, amount = ?, method = ?,
        gateway_provider = ?, gateway_reference = ?, notes = ?, journal_entry_id = ?
       WHERE id = ?`
    ).run(
      branchId,
      input.paymentDate,
      nextAmount,
      input.method,
      input.gatewayProvider ?? existing.gateway_provider ?? null,
      input.gatewayReference ?? existing.gateway_reference ?? null,
      String(input.notes ?? existing.notes ?? '').trim(),
      newJournalId,
      paymentId
    );

    db.prepare("UPDATE documents SET amount = ? WHERE entity_type = 'payment' AND entity_id = ?").run(
      nextAmount,
      paymentId
    );

    writeAuditLog(
      db,
      actor,
      'PAYMENT_UPDATED',
      'payment',
      paymentId,
      `Updated payment ${paymentNumber} to ${nextAmount} (${input.method}) with automatic journal re-posting`
    );
    return { id: paymentId };
  });
  return tx();
}

// 6. Purchases (Edit & Delete with Auto-Reversal + Stock Unwind)
export function deletePurchaseTransaction(
  db: Database.Database,
  purchaseId: number,
  actor: ActorContext
): { deletedId: number; reversedJournalId: number | null } {
  const tx = db.transaction(() => {
    const pur = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId) as
      | Record<string, unknown>
      | undefined;
    if (!pur) throw new Error('Purchase bill not found.');

    const billNumber = String(pur.bill_number);
    const branchId = Number(pur.branch_id);
    const items = db
      .prepare('SELECT product_id, quantity, unit_cost FROM purchase_items WHERE purchase_id = ?')
      .all(purchaseId) as { product_id: number; quantity: number; unit_cost: number }[];

    // Ensure enough stock exists to reverse purchased items
    for (const item of items) {
      const prod = db.prepare('SELECT name, track_inventory FROM products WHERE id = ?').get(item.product_id) as
        | { name: string; track_inventory: number }
        | undefined;
      if (!prod || !prod.track_inventory) continue;
      const stock = db
        .prepare('SELECT id, quantity FROM branch_stock WHERE branch_id = ? AND product_id = ?')
        .get(branchId, item.product_id) as { id: number; quantity: number } | undefined;
      const currentQty = stock ? Number(stock.quantity) : 0;
      if (currentQty + 0.0001 < Number(item.quantity)) {
        throw new Error(
          `Cannot delete purchase ${billNumber}: only ${currentQty} units of "${prod.name}" remain in branch stock (purchased ${item.quantity}).`
        );
      }
    }

    const reversedJournalId = safeReverseIfPosted(
      db,
      pur.journal_entry_id ? Number(pur.journal_entry_id) : null,
      `Auto-reversal on delete of purchase ${billNumber}`,
      actor
    );

    for (const item of items) {
      const prod = db.prepare('SELECT track_inventory FROM products WHERE id = ?').get(item.product_id) as
        | { track_inventory: number }
        | undefined;
      if (!prod || !prod.track_inventory) continue;
      const stock = db
        .prepare('SELECT id, quantity FROM branch_stock WHERE branch_id = ? AND product_id = ?')
        .get(branchId, item.product_id) as { id: number; quantity: number } | undefined;
      if (stock) {
        const nextQty = Math.max(0, roundMoney(Number(stock.quantity) - Number(item.quantity)));
        db.prepare('UPDATE branch_stock SET quantity = ? WHERE id = ?').run(nextQty, stock.id);
      }
      db.prepare(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
         VALUES (?, ?, 'out', ?, ?, ?, 'purchase_reversal', ?, ?, ?)`
      ).run(
        branchId,
        item.product_id,
        item.quantity,
        item.unit_cost,
        roundMoney(item.quantity * item.unit_cost),
        purchaseId,
        todayISO(),
        `Stock reversed on delete of ${billNumber}`
      );
    }

    db.prepare("DELETE FROM documents WHERE entity_type = 'purchase' AND entity_id = ?").run(purchaseId);
    db.prepare('DELETE FROM purchases WHERE id = ?').run(purchaseId);

    writeAuditLog(
      db,
      actor,
      'PURCHASE_DELETED',
      'purchase',
      purchaseId,
      `Deleted purchase ${billNumber} with automatic journal reversal & stock adjustment`
    );
    return { deletedId: purchaseId, reversedJournalId };
  });
  return tx();
}

export function updatePurchaseTransaction(
  db: Database.Database,
  purchaseId: number,
  input: {
    branchId: number;
    vendorId: number;
    purchaseDate: string;
    mushak61Ref?: string;
    notes?: string;
    payImmediately: boolean;
    paymentMethod?: PaymentMethod;
    items: { productId: number; quantity: number; unitCost: number; vatRate: number }[];
  },
  actor: ActorContext
): { id: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) throw new Error('Purchase bill not found.');
    if (!input.items || input.items.length === 0) {
      throw new Error('Purchase must contain at least one item.');
    }

    const vendor = db.prepare('SELECT id, name FROM vendors WHERE id = ?').get(input.vendorId) as
      | { id: number; name: string }
      | undefined;
    if (!vendor) throw new Error('Vendor not found.');

    const billNumber = String(existing.bill_number);
    const oldBranchId = Number(existing.branch_id);
    const oldItems = db
      .prepare('SELECT product_id, quantity, unit_cost FROM purchase_items WHERE purchase_id = ?')
      .all(purchaseId) as { product_id: number; quantity: number; unit_cost: number }[];

    // 1. Reverse old journal
    safeReverseIfPosted(
      db,
      existing.journal_entry_id ? Number(existing.journal_entry_id) : null,
      `Auto-reversal for edit of purchase ${billNumber}`,
      actor
    );

    // 2. Unwind old stock
    for (const item of oldItems) {
      const stock = db
        .prepare('SELECT id, quantity FROM branch_stock WHERE branch_id = ? AND product_id = ?')
        .get(oldBranchId, item.product_id) as { id: number; quantity: number } | undefined;
      if (stock) {
        const nextQty = Math.max(0, roundMoney(Number(stock.quantity) - Number(item.quantity)));
        db.prepare('UPDATE branch_stock SET quantity = ? WHERE id = ?').run(nextQty, stock.id);
      }
      db.prepare(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
         VALUES (?, ?, 'out', ?, ?, ?, 'purchase_reversal', ?, ?, ?)`
      ).run(
        oldBranchId,
        item.product_id,
        item.quantity,
        item.unit_cost,
        roundMoney(item.quantity * item.unit_cost),
        purchaseId,
        todayISO(),
        `Stock unwound before edit of ${billNumber}`
      );
    }

    // 3. Replace purchase_items & apply new stock
    db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(purchaseId);

    let subtotal = 0;
    let vatTotal = 0;
    const insertItem = db.prepare(
      `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, vat_rate, vat_amount, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of input.items) {
      const qty = Number(item.quantity);
      const cost = Number(item.unitCost);
      const vatRate = Math.max(0, Number(item.vatRate) || 0);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) {
        throw new Error('Invalid purchase item quantity or unit cost.');
      }
      const lineSub = roundMoney(qty * cost);
      const lineVat = roundMoney((lineSub * vatRate) / 100);
      const lineTotal = roundMoney(lineSub + lineVat);
      subtotal = roundMoney(subtotal + lineSub);
      vatTotal = roundMoney(vatTotal + lineVat);

      insertItem.run(purchaseId, item.productId, qty, cost, vatRate, lineVat, lineTotal);

      const stockRow = db
        .prepare('SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?')
        .get(input.branchId, item.productId) as
        | { id: number; quantity: number; avg_cost: number; fifo_lots_json: string }
        | undefined;
      const curQty = stockRow ? Number(stockRow.quantity) : 0;
      const curAvg = stockRow ? Number(stockRow.avg_cost) : cost;
      const curLots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];
      const updated = computeWeightedAvgStockIn(curQty, curAvg, qty, cost);
      const nextLots = [...curLots, { qty, unitCost: cost }];

      if (stockRow) {
        db.prepare('UPDATE branch_stock SET quantity = ?, avg_cost = ?, fifo_lots_json = ? WHERE id = ?').run(
          updated.newQty,
          updated.newAvgCost,
          JSON.stringify(nextLots),
          stockRow.id
        );
      } else {
        db.prepare(
          'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)'
        ).run(input.branchId, item.productId, updated.newQty, updated.newAvgCost, JSON.stringify(nextLots));
      }

      db.prepare('UPDATE products SET cost_price = ? WHERE id = ?').run(cost, item.productId);
      db.prepare(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
         VALUES (?, ?, 'in', ?, ?, ?, 'purchase', ?, ?, ?)`
      ).run(input.branchId, item.productId, qty, cost, lineSub, purchaseId, input.purchaseDate, `Updated ${billNumber}`);
    }

    const grandTotal = roundMoney(subtotal + vatTotal);
    const creditAccount = input.payImmediately
      ? paymentMethodToAccountCode(input.paymentMethod || 'bank')
      : '2000';
    const journalLines: JournalLine[] = [
      { accountCode: '1200', debit: subtotal, credit: 0, memo: `Inventory purchase ${billNumber} (updated)` },
      { accountCode: creditAccount, debit: 0, credit: grandTotal, memo: `Purchase settlement ${billNumber}` },
    ];
    if (vatTotal > 0) {
      journalLines.push({ accountCode: '1300', debit: vatTotal, credit: 0, memo: `Input VAT ${billNumber}` });
    }

    const newJournalId = postJournalEntry(db, {
      entryDate: input.purchaseDate,
      branchId: input.branchId,
      sourceType: 'purchase',
      sourceId: purchaseId,
      description: `Purchase ${billNumber} (Updated) · ${vendor.name}`,
      lines: journalLines,
      actor,
    });

    db.prepare(
      `UPDATE purchases SET
        mushak_61_ref = ?, branch_id = ?, vendor_id = ?, purchase_date = ?,
        subtotal = ?, vat_total = ?, grand_total = ?, paid_amount = ?, status = ?,
        notes = ?, journal_entry_id = ?
       WHERE id = ?`
    ).run(
      String(input.mushak61Ref ?? existing.mushak_61_ref ?? '').trim(),
      input.branchId,
      input.vendorId,
      input.purchaseDate,
      subtotal,
      vatTotal,
      grandTotal,
      input.payImmediately ? grandTotal : 0,
      input.payImmediately ? 'paid' : 'posted',
      String(input.notes ?? '').trim(),
      newJournalId,
      purchaseId
    );

    db.prepare("UPDATE documents SET party_name = ?, amount = ? WHERE entity_type = 'purchase' AND entity_id = ?").run(
      vendor.name,
      grandTotal,
      purchaseId
    );

    writeAuditLog(
      db,
      actor,
      'PURCHASE_UPDATED',
      'purchase',
      purchaseId,
      `Updated purchase ${billNumber} (${grandTotal}) with automatic journal re-posting`
    );
    return { id: purchaseId };
  });
  return tx();
}

// 7. Expenses (Edit & Delete with Auto-Reversal)
export function deleteExpenseTransaction(
  db: Database.Database,
  expenseId: number,
  actor: ActorContext
): { deletedId: number; reversedJournalId: number | null } {
  const tx = db.transaction(() => {
    const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId) as
      | Record<string, unknown>
      | undefined;
    if (!exp) throw new Error('Expense not found.');

    const expenseNumber = String(exp.expense_number);
    const reversedJournalId = safeReverseIfPosted(
      db,
      exp.journal_entry_id ? Number(exp.journal_entry_id) : null,
      `Auto-reversal on delete of expense ${expenseNumber}`,
      actor
    );

    db.prepare('DELETE FROM expenses WHERE id = ?').run(expenseId);
    writeAuditLog(
      db,
      actor,
      'EXPENSE_DELETED',
      'expense',
      expenseId,
      `Deleted expense ${expenseNumber} (${exp.category}, ${exp.total_amount}) with automatic journal reversal`
    );
    return { deletedId: expenseId, reversedJournalId };
  });
  return tx();
}

export function updateExpenseTransaction(
  db: Database.Database,
  expenseId: number,
  input: {
    branchId: number;
    expenseDate: string;
    category: string;
    accountCode: string;
    vendorName?: string;
    amount: number;
    vatAmount?: number;
    paymentMethod: PaymentMethod;
    reference?: string;
    notes?: string;
  },
  actor: ActorContext
): { id: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) throw new Error('Expense not found.');

    const amount = roundMoney(Number(input.amount));
    const vatAmount = roundMoney(Math.max(0, Number(input.vatAmount) || 0));
    const totalAmount = roundMoney(amount + vatAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Expense amount must be greater than zero.');
    }

    const expenseNumber = String(existing.expense_number);
    safeReverseIfPosted(
      db,
      existing.journal_entry_id ? Number(existing.journal_entry_id) : null,
      `Auto-reversal for edit of expense ${expenseNumber}`,
      actor
    );

    const creditAcc = paymentMethodToAccountCode(input.paymentMethod || 'cash');
    const lines: JournalLine[] = [
      { accountCode: input.accountCode || '5500', debit: amount, credit: 0, memo: `${input.category} (${expenseNumber})` },
      { accountCode: creditAcc, debit: 0, credit: totalAmount, memo: `Paid via ${input.paymentMethod}` },
    ];
    if (vatAmount > 0) {
      lines.push({ accountCode: '1300', debit: vatAmount, credit: 0, memo: `Input VAT ${expenseNumber}` });
    }

    const newJournalId = postJournalEntry(db, {
      entryDate: input.expenseDate,
      branchId: input.branchId,
      sourceType: 'expense',
      sourceId: expenseId,
      description: `Expense ${expenseNumber} (Updated) · ${input.category}`,
      lines,
      actor,
    });

    db.prepare(
      `UPDATE expenses SET
        branch_id = ?, expense_date = ?, category = ?, account_code = ?, vendor_name = ?,
        amount = ?, vat_amount = ?, total_amount = ?, payment_method = ?, reference = ?,
        notes = ?, journal_entry_id = ?
       WHERE id = ?`
    ).run(
      input.branchId,
      input.expenseDate,
      String(input.category).trim(),
      String(input.accountCode || '5500').trim(),
      String(input.vendorName || '').trim(),
      amount,
      vatAmount,
      totalAmount,
      input.paymentMethod || 'cash',
      String(input.reference || '').trim(),
      String(input.notes || '').trim(),
      newJournalId,
      expenseId
    );

    writeAuditLog(
      db,
      actor,
      'EXPENSE_UPDATED',
      'expense',
      expenseId,
      `Updated expense ${expenseNumber} (${input.category}, ${totalAmount}) with automatic journal re-posting`
    );
    return { id: expenseId };
  });
  return tx();
}

// 8. Recurring Billing Profiles
export function updateRecurringProfile(
  db: Database.Database,
  id: number,
  input: {
    title: string;
    customerId: number;
    branchId?: number;
    frequency: RecurringFrequency;
    nextRunDate: string;
    items: InvoiceLineInput[];
  },
  actor: ActorContext
): { id: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, branch_id FROM recurring_profiles WHERE id = ?').get(id) as
      | { id: number; branch_id: number }
      | undefined;
    if (!existing) throw new Error('Recurring schedule not found.');
    if (!input.title || !input.title.trim()) throw new Error('Schedule title is required.');
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('At least one line item is required.');
    }

    const computed = computeInvoiceTotals(input.items, 'exclusive');
    db.prepare(
      `UPDATE recurring_profiles SET
        title = ?, customer_id = ?, branch_id = ?, frequency = ?, next_run_date = ?,
        items_json = ?, estimated_total = ?
       WHERE id = ?`
    ).run(
      input.title.trim(),
      Number(input.customerId),
      Number(input.branchId) || existing.branch_id,
      input.frequency,
      input.nextRunDate,
      JSON.stringify(input.items),
      computed.grandTotal,
      id
    );

    writeAuditLog(
      db,
      actor,
      'RECURRING_UPDATED',
      'recurring_profile',
      id,
      `Updated recurring schedule "${input.title.trim()}" (${input.frequency})`
    );
    return { id };
  });
  return tx();
}

export function deleteRecurringProfile(
  db: Database.Database,
  id: number,
  actor: ActorContext
): { deletedId: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, title FROM recurring_profiles WHERE id = ?').get(id) as
      | { id: number; title: string }
      | undefined;
    if (!existing) throw new Error('Recurring schedule not found.');

    db.prepare('DELETE FROM recurring_profiles WHERE id = ?').run(id);
    writeAuditLog(
      db,
      actor,
      'RECURRING_DELETED',
      'recurring_profile',
      id,
      `Deleted recurring schedule "${existing.title}"`
    );
    return { deletedId: id };
  });
  return tx();
}

// 9. Tax Rules
export function updateTaxRule(
  db: Database.Database,
  id: number,
  input: {
    code: string;
    name: string;
    nameBn?: string;
    rate: number;
    sdRate?: number;
    mushakCategory?: string;
    effectiveFrom: string;
  },
  actor: ActorContext
): { id: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM tax_rules WHERE id = ?').get(id);
    if (!existing) throw new Error('Tax rule not found.');
    const rate = Math.max(0, Number(input.rate) || 0);
    const sdRate = Math.max(0, Number(input.sdRate) || 0);

    db.prepare(
      `UPDATE tax_rules SET code = ?, name = ?, name_bn = ?, rate = ?, sd_rate = ?, mushak_category = ?, effective_from = ?
       WHERE id = ?`
    ).run(
      String(input.code).trim().toUpperCase(),
      String(input.name).trim(),
      String(input.nameBn || input.name).trim(),
      rate,
      sdRate,
      String(input.mushakCategory || (rate === 15 ? 'standard' : rate === 0 ? 'zero_rated' : 'truncated')),
      String(input.effectiveFrom || todayISO()),
      id
    );

    writeAuditLog(
      db,
      actor,
      'TAX_RULE_UPDATED',
      'tax_rule',
      id,
      `Updated VAT rule ${String(input.code).toUpperCase()} (${rate}%)`
    );
    return { id };
  });
  return tx();
}

export function deleteTaxRule(
  db: Database.Database,
  id: number,
  actor: ActorContext
): { deletedId: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, code, is_default FROM tax_rules WHERE id = ?').get(id) as
      | { id: number; code: string; is_default: number }
      | undefined;
    if (!existing) throw new Error('Tax rule not found.');
    if (existing.is_default) throw new Error('Cannot delete the default VAT rule.');

    const prodCount = (
      db.prepare('SELECT COUNT(*) as c FROM products WHERE tax_rule_id = ?').get(id) as { c: number }
    ).c;
    const invItemCount = (
      db.prepare('SELECT COUNT(*) as c FROM invoice_items WHERE tax_rule_id = ?').get(id) as { c: number }
    ).c;
    if (prodCount > 0 || invItemCount > 0) {
      throw new Error(
        `Cannot delete VAT rule "${existing.code}" because it is assigned to ${prodCount} product(s) and ${invItemCount} invoice line(s).`
      );
    }

    db.prepare('DELETE FROM tax_rules WHERE id = ?').run(id);
    writeAuditLog(db, actor, 'TAX_RULE_DELETED', 'tax_rule', id, `Deleted VAT rule ${existing.code}`);
    return { deletedId: id };
  });
  return tx();
}

// 10. Branches
export function updateBranchRecord(
  db: Database.Database,
  id: number,
  input: { code: string; name: string; nameBn?: string; address?: string; phone?: string },
  actor: ActorContext
): { id: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM branches WHERE id = ?').get(id);
    if (!existing) throw new Error('Branch not found.');
    if (!input.code?.trim() || !input.name?.trim()) {
      throw new Error('Branch code and name are required.');
    }

    db.prepare('UPDATE branches SET code = ?, name = ?, name_bn = ?, address = ?, phone = ? WHERE id = ?').run(
      input.code.trim().toUpperCase().slice(0, 6),
      input.name.trim(),
      String(input.nameBn || input.name).trim(),
      String(input.address || '').trim(),
      String(input.phone || '').trim(),
      id
    );

    writeAuditLog(
      db,
      actor,
      'BRANCH_UPDATED',
      'branch',
      id,
      `Updated branch ${input.name.trim()} (${input.code.trim().toUpperCase()})`
    );
    return { id };
  });
  return tx();
}

export function deleteBranchRecord(
  db: Database.Database,
  id: number,
  actor: ActorContext
): { deletedId: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, code, name, is_main FROM branches WHERE id = ?').get(id) as
      | { id: number; code: string; name: string; is_main: number }
      | undefined;
    if (!existing) throw new Error('Branch not found.');
    if (existing.is_main) throw new Error('Cannot delete the main Head Office branch.');

    const refs =
      (db.prepare('SELECT COUNT(*) as c FROM invoices WHERE branch_id = ?').get(id) as { c: number }).c +
      (db.prepare('SELECT COUNT(*) as c FROM purchases WHERE branch_id = ?').get(id) as { c: number }).c +
      (db.prepare('SELECT COUNT(*) as c FROM expenses WHERE branch_id = ?').get(id) as { c: number }).c +
      (db.prepare('SELECT COUNT(*) as c FROM payments WHERE branch_id = ?').get(id) as { c: number }).c +
      (db.prepare('SELECT COUNT(*) as c FROM journal_entries WHERE branch_id = ?').get(id) as { c: number }).c +
      (db.prepare('SELECT COUNT(*) as c FROM users WHERE branch_id = ?').get(id) as { c: number }).c +
      (db.prepare('SELECT COUNT(*) as c FROM branch_stock WHERE branch_id = ? AND quantity > 0').get(id) as { c: number }).c;

    if (refs > 0) {
      throw new Error(
        `Cannot delete branch "${existing.name}" because it has existing stock, staff, or ledger transactions.`
      );
    }

    db.prepare('DELETE FROM stock_movements WHERE branch_id = ?').run(id);
    db.prepare('DELETE FROM branch_stock WHERE branch_id = ?').run(id);
    db.prepare('DELETE FROM branches WHERE id = ?').run(id);
    writeAuditLog(db, actor, 'BRANCH_DELETED', 'branch', id, `Deleted branch ${existing.name} (${existing.code})`);
    return { deletedId: id };
  });
  return tx();
}

// 11. Users / Staff
export function updateUserRecord(
  db: Database.Database,
  id: number,
  input: {
    name: string;
    email: string;
    role: string;
    branchId?: number | null;
    passwordHash?: string | null;
  },
  actor: ActorContext
): { id: number } {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as
      | { id: number; role: string }
      | undefined;
    if (!existing) throw new Error('User not found.');
    if (!input.name?.trim() || !input.email?.trim() || !input.role) {
      throw new Error('Name, email, and role are required.');
    }

    // Prevent demoting the last active owner
    if (existing.role === 'owner' && input.role !== 'owner') {
      const ownerCount = (
        db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'owner' AND is_active = 1").get() as { c: number }
      ).c;
      if (ownerCount <= 1) {
        throw new Error('Cannot change role of the last active Owner account.');
      }
    }

    if (input.passwordHash) {
      db.prepare('UPDATE users SET name = ?, email = ?, role = ?, branch_id = ?, password_hash = ? WHERE id = ?').run(
        input.name.trim(),
        input.email.trim().toLowerCase(),
        input.role,
        input.branchId ?? null,
        input.passwordHash,
        id
      );
    } else {
      db.prepare('UPDATE users SET name = ?, email = ?, role = ?, branch_id = ? WHERE id = ?').run(
        input.name.trim(),
        input.email.trim().toLowerCase(),
        input.role,
        input.branchId ?? null,
        id
      );
    }

    writeAuditLog(
      db,
      actor,
      'USER_UPDATED',
      'user',
      id,
      `Updated user ${input.name.trim()} (${input.role})`
    );
    return { id };
  });
  return tx();
}

export function deleteUserRecord(
  db: Database.Database,
  id: number,
  currentUserId: number,
  actor: ActorContext
): { deletedId: number } {
  const tx = db.transaction(() => {
    if (id === currentUserId) {
      throw new Error('You cannot delete your currently signed-in account.');
    }
    const existing = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id) as
      | { id: number; name: string; email: string; role: string }
      | undefined;
    if (!existing) throw new Error('User not found.');

    if (existing.role === 'owner') {
      const ownerCount = (
        db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'owner' AND is_active = 1").get() as { c: number }
      ).c;
      if (ownerCount <= 1) {
        throw new Error('Cannot delete the last active Owner account.');
      }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    writeAuditLog(
      db,
      actor,
      'USER_DELETED',
      'user',
      id,
      `Deleted team member ${existing.name} (${existing.email})`
    );
    return { deletedId: id };
  });
  return tx();
}

