import { roundMoney } from '../../engine/accounting.ts';
import {
  allocatePayment,
  buildCustomerStatement,
  computeInvoiceTotals,
  computeNextRecurringDate,
  resolveInvoiceStatus,
} from '../../engine/billing.ts';
import { todayISO } from '../../engine/format.ts';
import { computeStockOutCOGS, computeWeightedAvgStockIn, type StockLot } from '../../engine/inventory.ts';
import type {
  Expense,
  Invoice,
  InvoiceLineInput,
  JournalLine,
  Payment,
  PaymentMethod,
  Purchase,
  RecurringFrequency,
  StatementRow,
} from '../../engine/types.ts';
import { formatMushakChallanNo } from '../../engine/vat.ts';
import type { DbClient } from '../dbClient.ts';
import {
  getInvoiceById,
  getOrganization,
  listCustomersWithBalances,
  nextSequence,
  paymentMethodToAccountCode,
  postJournalEntry,
  restoreBranchStockFromSale,
  safeReverseIfPosted,
  writeAuditLog,
  type ActorContext,
} from './sharedService.ts';

export async function recordPaymentInternal(
  db: DbClient,
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
): Promise<Payment> {
  const customer = await db.get<{ id: number; name: string }>(
    'SELECT id, name FROM customers WHERE id = ?',
    [input.customerId]
  );
  if (!customer) throw new Error('Customer not found.');

  const openRows = await db.all<{
    id: number;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    grandTotal: number;
    paidAmount: number;
    balanceDue: number;
  }>(
    `SELECT id, invoice_number as invoiceNumber, issue_date as issueDate, due_date as dueDate,
            grand_total as grandTotal, paid_amount as paidAmount,
            ROUND(grand_total - paid_amount, 2) as balanceDue
     FROM invoices
     WHERE customer_id = ? AND status NOT IN ('paid', 'void', 'draft') AND ROUND(grand_total - paid_amount, 2) > 0
     ORDER BY issue_date ASC, id ASC`,
    [input.customerId]
  );

  const plan = allocatePayment(
    input.amount,
    openRows.map((r) => ({
      id: Number(r.id),
      invoiceNumber: r.invoiceNumber,
      issueDate: r.issueDate,
      balanceDue: Number(r.balanceDue),
    })),
    input.invoiceId
  );

  const seq = await nextSequence(db, 'payments');
  const year = input.paymentDate.slice(0, 4) || String(new Date().getFullYear());
  const paymentNumber = `PAY-${year}-${String(seq).padStart(5, '0')}`;

  const payInfo = await db.run(
    `INSERT INTO payments (
      payment_number, customer_id, branch_id, payment_date, amount, method,
      gateway_provider, gateway_reference, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      paymentNumber,
      input.customerId,
      input.branchId,
      input.paymentDate,
      roundMoney(input.amount),
      input.method,
      input.gatewayProvider ?? null,
      input.gatewayReference ?? null,
      input.notes || '',
    ]
  );

  const paymentId = Number(payInfo.lastInsertRowid);
  for (const alloc of plan.allocations) {
    await db.run('INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES (?, ?, ?)', [
      paymentId,
      alloc.invoiceId,
      alloc.amount,
    ]);
    const inv = openRows.find((r) => Number(r.id) === alloc.invoiceId)!;
    const nextPaid = roundMoney(Number(inv.paidAmount) + alloc.amount);
    const nextStatus = resolveInvoiceStatus({
      grandTotal: Number(inv.grandTotal),
      paidAmount: nextPaid,
      dueDate: inv.dueDate,
      today: todayISO(),
    });
    await db.run('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?', [
      nextPaid,
      nextStatus,
      alloc.invoiceId,
    ]);
  }

  const cashAccountCode = paymentMethodToAccountCode(input.method);
  const journalEntryId = await postJournalEntry(db, {
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

  await db.run('UPDATE payments SET journal_entry_id = ? WHERE id = ?', [journalEntryId, paymentId]);

  await db.run(
    `INSERT INTO documents (doc_type, reference_number, entity_type, entity_id, title, party_name, amount, issued_at)
     VALUES ('receipt', ?, 'payment', ?, ?, ?, ?, ?)`,
    [paymentNumber, paymentId, `Payment Receipt ${paymentNumber}`, customer.name, roundMoney(input.amount), input.paymentDate]
  );

  await writeAuditLog(
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

export async function createInvoiceTransaction(
  db: DbClient,
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
): Promise<Invoice> {
  if (input.idempotencyKey) {
    const existing = await db.get<{ response_json: string }>(
      'SELECT response_json FROM idempotency_keys WHERE key = ?',
      [input.idempotencyKey]
    );
    if (existing) {
      return JSON.parse(existing.response_json) as Invoice;
    }
  }

  return db.transaction(async (tx) => {
    const org = await getOrganization(tx);
    const branch = await tx.get<{ id: number; code: string; name: string }>(
      'SELECT * FROM branches WHERE id = ?',
      [input.branchId]
    );
    if (!branch) throw new Error('Selected branch does not exist.');

    const customer = await tx.get<{ id: number; name: string; company_name: string }>(
      'SELECT * FROM customers WHERE id = ?',
      [input.customerId]
    );
    if (!customer) throw new Error('Selected customer does not exist.');

    const computed = computeInvoiceTotals(input.items, org.vatMode);
    const seq = await nextSequence(tx, 'invoices');
    const year = Number(input.issueDate.slice(0, 4)) || new Date().getFullYear();
    const invoiceNumber = `${org.invoicePrefix}-${branch.code}-${year}-${String(seq).padStart(5, '0')}`;
    const mushakChallanNo = formatMushakChallanNo(org.mushakPrefix, branch.code, seq, year);

    const status = resolveInvoiceStatus({
      grandTotal: computed.grandTotal,
      paidAmount: 0,
      dueDate: input.dueDate,
      today: todayISO(),
    });

    const invInfo = await tx.run(
      `INSERT INTO invoices (
        invoice_number, mushak_challan_no, branch_id, customer_id,
        issue_date, due_date, status, source,
        subtotal, discount_total, sd_total, vat_total, grand_total, paid_amount, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
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
        input.notes || '',
      ]
    );

    const invoiceId = Number(invInfo.lastInsertRowid);
    let totalCogs = 0;

    for (const line of computed.lines) {
      await tx.run(
        `INSERT INTO invoice_items (
          invoice_id, product_id, description, quantity, unit_price, discount_amount,
          tax_rule_id, tax_rate, sd_rate, taxable_value, sd_amount, vat_amount, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
          line.lineTotal,
        ]
      );

      if (line.productId) {
        const prod = await tx.get<{ id: number; track_inventory: number; cost_price: number }>(
          'SELECT id, track_inventory, cost_price FROM products WHERE id = ?',
          [line.productId]
        );

        if (prod && prod.track_inventory) {
          const stockRow = await tx.get<{ id: number; quantity: number; avg_cost: number; fifo_lots_json: string }>(
            'SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?',
            [input.branchId, prod.id]
          );

          const currentQty = Number(stockRow?.quantity ?? 0);
          const currentAvgCost = Number(stockRow?.avg_cost ?? prod.cost_price);
          const fifoLots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];

          const out = computeStockOutCOGS({
            method: org.inventoryMethod,
            currentQty,
            currentAvgCost,
            soldQty: line.quantity,
            fifoLots,
          });

          if (stockRow) {
            await tx.run('UPDATE branch_stock SET quantity = ?, fifo_lots_json = ? WHERE id = ?', [
              out.remainingQty,
              JSON.stringify(out.remainingLots ?? fifoLots),
              stockRow.id,
            ]);
          } else {
            await tx.run(
              'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)',
              [input.branchId, prod.id, out.remainingQty, currentAvgCost, '[]']
            );
          }

          await tx.run(
            `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date)
             VALUES (?, ?, 'out', ?, ?, ?, 'invoice', ?, ?)`,
            [
              input.branchId,
              prod.id,
              line.quantity,
              out.effectiveUnitCost,
              out.cogsTotal,
              invoiceId,
              input.issueDate,
            ]
          );

          totalCogs = roundMoney(totalCogs + out.cogsTotal);
        }
      }
    }

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

    const journalEntryId = await postJournalEntry(tx, {
      entryDate: input.issueDate,
      branchId: input.branchId,
      sourceType: input.source || 'invoice',
      sourceId: invoiceId,
      description: `Invoice ${invoiceNumber} — ${customer.name} (${mushakChallanNo})`,
      lines: journalLines,
      actor,
    });

    await tx.run('UPDATE invoices SET journal_entry_id = ? WHERE id = ?', [journalEntryId, invoiceId]);

    await tx.run(
      `INSERT INTO documents (doc_type, reference_number, entity_type, entity_id, title, party_name, amount, issued_at)
       VALUES ('invoice', ?, 'invoice', ?, ?, ?, ?, ?)`,
      [invoiceNumber, invoiceId, `Tax Invoice ${invoiceNumber}`, customer.name, computed.grandTotal, input.issueDate]
    );

    await tx.run(
      `INSERT INTO documents (doc_type, reference_number, entity_type, entity_id, title, party_name, amount, issued_at)
       VALUES ('mushak_63', ?, 'invoice', ?, ?, ?, ?, ?)`,
      [
        mushakChallanNo,
        invoiceId,
        `Mushak 6.3 Challan ${mushakChallanNo}`,
        customer.name,
        computed.grandTotal,
        input.issueDate,
      ]
    );

    await writeAuditLog(
      tx,
      actor,
      input.source === 'pos' ? 'POS_SALE_POSTED' : 'INVOICE_POSTED',
      'invoice',
      invoiceId,
      `Posted ${invoiceNumber} (${mushakChallanNo}) for ${customer.name}: Total ${computed.grandTotal}, VAT ${computed.vatTotal}`
    );

    if (input.immediatePayment && input.immediatePayment.amount > 0) {
      await recordPaymentInternal(
        tx,
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

    const result = (await getInvoiceById(tx, invoiceId))!;

    if (input.idempotencyKey) {
      await tx.run('INSERT INTO idempotency_keys (key, endpoint, response_json) VALUES (?, ?, ?)', [
        input.idempotencyKey,
        'create_invoice',
        JSON.stringify(result),
      ]);
    }

    return result;
  });
}

export async function recordPaymentTransaction(
  db: DbClient,
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
): Promise<Payment> {
  if (input.idempotencyKey) {
    const existing = await db.get<{ response_json: string }>(
      'SELECT response_json FROM idempotency_keys WHERE key = ?',
      [input.idempotencyKey]
    );
    if (existing) {
      return JSON.parse(existing.response_json) as Payment;
    }
  }

  return db.transaction(async (tx) => {
    const payment = await recordPaymentInternal(tx, input, actor);
    if (input.idempotencyKey) {
      await tx.run('INSERT INTO idempotency_keys (key, endpoint, response_json) VALUES (?, ?, ?)', [
        input.idempotencyKey,
        'record_payment',
        JSON.stringify(payment),
      ]);
    }
    return payment;
  });
}

export async function createPurchaseTransaction(
  db: DbClient,
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
): Promise<Purchase> {
  if (!input.items || input.items.length === 0) {
    throw new Error('Purchase bill requires at least one product line.');
  }

  return db.transaction(async (tx) => {
    const vendor = await tx.get<{ id: number; name: string }>('SELECT id, name FROM vendors WHERE id = ?', [
      input.vendorId,
    ]);
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
    const seq = await nextSequence(tx, 'purchases');
    const year = input.purchaseDate.slice(0, 4) || String(new Date().getFullYear());
    const billNumber = `BILL-${year}-${String(seq).padStart(5, '0')}`;
    const mushak61Ref = input.mushak61Ref?.trim() || `M61-${year}-${String(seq).padStart(5, '0')}`;
    const paidAmount = input.payImmediately ? grandTotal : 0;
    const status: Purchase['status'] = input.payImmediately ? 'paid' : 'posted';

    const info = await tx.run(
      `INSERT INTO purchases (bill_number, mushak_61_ref, branch_id, vendor_id, purchase_date, subtotal, vat_total, grand_total, paid_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
        input.notes || '',
      ]
    );

    const purchaseId = Number(info.lastInsertRowid);

    for (const item of prepared) {
      await tx.run(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, vat_rate, vat_amount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [purchaseId, item.productId, item.quantity, item.unitCost, item.vatRate || 0, item.lineVat, item.lineTotal]
      );

      const stockRow = await tx.get<{ id: number; quantity: number; avg_cost: number; fifo_lots_json: string }>(
        'SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?',
        [input.branchId, item.productId]
      );

      const calc = computeWeightedAvgStockIn(
        Number(stockRow?.quantity ?? 0),
        Number(stockRow?.avg_cost ?? item.unitCost),
        item.quantity,
        item.unitCost
      );
      const lots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];
      lots.push({ qty: item.quantity, unitCost: item.unitCost });

      if (stockRow) {
        await tx.run('UPDATE branch_stock SET quantity = ?, avg_cost = ?, fifo_lots_json = ? WHERE id = ?', [
          calc.newQty,
          calc.newAvgCost,
          JSON.stringify(lots),
          stockRow.id,
        ]);
      } else {
        await tx.run(
          'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)',
          [input.branchId, item.productId, calc.newQty, calc.newAvgCost, JSON.stringify(lots)]
        );
      }

      await tx.run('UPDATE products SET cost_price = ? WHERE id = ?', [calc.newAvgCost, item.productId]);

      await tx.run(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date)
         VALUES (?, ?, 'in', ?, ?, ?, 'purchase', ?, ?)`,
        [input.branchId, item.productId, item.quantity, item.unitCost, item.lineSub, purchaseId, input.purchaseDate]
      );
    }

    const creditAccount = input.payImmediately ? paymentMethodToAccountCode(input.paymentMethod || 'bank') : '2000';
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

    const journalEntryId = await postJournalEntry(tx, {
      entryDate: input.purchaseDate,
      branchId: input.branchId,
      sourceType: 'purchase',
      sourceId: purchaseId,
      description: `Purchase ${billNumber} from ${vendor.name} (${mushak61Ref})`,
      lines,
      actor,
    });

    await tx.run('UPDATE purchases SET journal_entry_id = ? WHERE id = ?', [journalEntryId, purchaseId]);

    await tx.run(
      `INSERT INTO documents (doc_type, reference_number, entity_type, entity_id, title, party_name, amount, issued_at)
       VALUES ('purchase_bill', ?, 'purchase', ?, ?, ?, ?, ?)`,
      [billNumber, purchaseId, `Purchase Bill ${billNumber} (${mushak61Ref})`, vendor.name, grandTotal, input.purchaseDate]
    );

    await writeAuditLog(
      tx,
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
}

export async function createExpenseTransaction(
  db: DbClient,
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
): Promise<Expense> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Expense amount must be greater than zero.');
  }
  const vatAmount = Math.max(0, roundMoney(input.vatAmount || 0));
  const amount = roundMoney(input.amount);
  const totalAmount = roundMoney(amount + vatAmount);

  return db.transaction(async (tx) => {
    const seq = await nextSequence(tx, 'expenses');
    const year = input.expenseDate.slice(0, 4) || String(new Date().getFullYear());
    const expenseNumber = `EXP-${year}-${String(seq).padStart(5, '0')}`;

    const info = await tx.run(
      `INSERT INTO expenses (
        expense_number, branch_id, expense_date, category, account_code, vendor_name,
        amount, vat_amount, total_amount, payment_method, reference, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
        input.notes || '',
      ]
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

    const journalEntryId = await postJournalEntry(tx, {
      entryDate: input.expenseDate,
      branchId: input.branchId,
      sourceType: 'expense',
      sourceId: expenseId,
      description: `Expense ${expenseNumber} — ${input.category}`,
      lines,
      actor,
    });

    await tx.run('UPDATE expenses SET journal_entry_id = ? WHERE id = ?', [journalEntryId, expenseId]);

    await writeAuditLog(
      tx,
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
}

export async function runRecurringProfileNow(
  db: DbClient,
  profileId: number,
  actor: ActorContext
): Promise<Invoice> {
  const row = await db.get<{
    id: number;
    title: string;
    customer_id: number;
    branch_id: number;
    frequency: RecurringFrequency;
    next_run_date: string;
    status: string;
    items_json: string;
  }>('SELECT * FROM recurring_profiles WHERE id = ?', [profileId]);

  if (!row) throw new Error('Recurring billing profile not found.');
  if (row.status !== 'active') throw new Error('Recurring profile is paused.');

  const items = JSON.parse(row.items_json) as InvoiceLineInput[];
  const issueDate = todayISO();
  const dueDate = computeNextRecurringDate(issueDate, 'weekly');
  const idempotencyKey = `recurring:${row.id}:${row.next_run_date}`;

  const invoice = await createInvoiceTransaction(
    db,
    {
      branchId: Number(row.branch_id),
      customerId: Number(row.customer_id),
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
  await db.run('UPDATE recurring_profiles SET last_run_date = ?, next_run_date = ? WHERE id = ?', [
    issueDate,
    nextRun,
    row.id,
  ]);

  return invoice;
}

export async function getCustomerStatementData(
  db: DbClient,
  customerId: number
): Promise<{ customer: Awaited<ReturnType<typeof listCustomersWithBalances>>[number]; rows: StatementRow[]; closingBalance: number }> {
  const customers = await listCustomersWithBalances(db);
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) throw new Error('Customer not found.');

  const invoices = await db.all<{ date: string; reference: string; challan: string; amount: number }>(
    `SELECT issue_date as date, invoice_number as reference, mushak_challan_no as challan, grand_total as amount
     FROM invoices WHERE customer_id = ? AND status != 'void'`,
    [customerId]
  );

  const payments = await db.all<{ date: string; reference: string; method: string; amount: number }>(
    `SELECT payment_date as date, payment_number as reference, method, amount
     FROM payments WHERE customer_id = ?`,
    [customerId]
  );

  const txs = [
    ...invoices.map((i) => ({
      date: i.date,
      type: 'invoice' as const,
      reference: i.reference,
      description: `Invoice (${i.challan})`,
      amount: Number(i.amount),
    })),
    ...payments.map((p) => ({
      date: p.date,
      type: 'payment' as const,
      reference: p.reference,
      description: `Payment Received (${p.method.toUpperCase()})`,
      amount: Number(p.amount),
    })),
  ];

  const statement = buildCustomerStatement(customer.openingBalance, txs);
  return { customer, rows: statement.rows, closingBalance: statement.closingBalance };
}

export async function deleteInvoiceTransaction(
  db: DbClient,
  invoiceId: number,
  actor: ActorContext
): Promise<{ deletedId: number; reversedJournalId: number | null }> {
  return db.transaction(async (tx) => {
    const inv = await tx.get<Record<string, unknown>>('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (!inv) throw new Error('Invoice not found.');

    const invoiceNumber = String(inv.invoice_number);
    const branchId = Number(inv.branch_id);

    const allocations = await tx.all<{ payment_id: number; amount: number }>(
      'SELECT payment_id, amount FROM payment_allocations WHERE invoice_id = ?',
      [invoiceId]
    );

    for (const alloc of allocations) {
      const otherRow = await tx.get<{ c: number }>(
        'SELECT COUNT(*) as c FROM payment_allocations WHERE payment_id = ? AND invoice_id != ?',
        [alloc.payment_id, invoiceId]
      );
      if ((otherRow?.c ?? 0) > 0) {
        const payRow = await tx.get<{ payment_number: string }>('SELECT payment_number FROM payments WHERE id = ?', [
          alloc.payment_id,
        ]);
        throw new Error(
          `Invoice ${invoiceNumber} shares payment ${payRow?.payment_number || '#' + alloc.payment_id} with another invoice. Delete that payment first.`
        );
      }
      const pay = await tx.get<{ id: number; payment_number: string; journal_entry_id: number | null }>(
        'SELECT * FROM payments WHERE id = ?',
        [alloc.payment_id]
      );
      if (pay) {
        await safeReverseIfPosted(
          tx,
          pay.journal_entry_id,
          `Auto-reversal of ${pay.payment_number} on delete of ${invoiceNumber}`,
          actor
        );
        await tx.run("DELETE FROM documents WHERE entity_type = 'payment' AND entity_id = ?", [pay.id]);
        await tx.run('DELETE FROM payments WHERE id = ?', [pay.id]);
      }
    }

    const reversedJournalId = await safeReverseIfPosted(
      tx,
      inv.journal_entry_id ? Number(inv.journal_entry_id) : null,
      `Auto-reversal on delete of invoice ${invoiceNumber}`,
      actor
    );

    const saleMoves = await tx.all<{ product_id: number; quantity: number; unit_cost: number }>(
      `SELECT product_id, quantity, unit_cost FROM stock_movements
       WHERE source_type = 'invoice' AND source_id = ? AND movement_type = 'out'`,
      [invoiceId]
    );

    for (const mv of saleMoves) {
      await restoreBranchStockFromSale(
        tx,
        branchId,
        Number(mv.product_id),
        Number(mv.quantity),
        Number(mv.unit_cost),
        invoiceId,
        `Stock restored on delete of ${invoiceNumber}`
      );
    }

    await tx.run("DELETE FROM documents WHERE entity_type = 'invoice' AND entity_id = ?", [invoiceId]);
    await tx.run('DELETE FROM invoices WHERE id = ?', [invoiceId]);

    await writeAuditLog(
      tx,
      actor,
      'INVOICE_DELETED',
      'invoice',
      invoiceId,
      `Deleted invoice ${invoiceNumber} with automatic double-entry reversal & stock restoration`
    );

    return { deletedId: invoiceId, reversedJournalId };
  });
}

export async function updateInvoiceTransaction(
  db: DbClient,
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
): Promise<Invoice> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<Record<string, unknown>>('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (!existing) throw new Error('Invoice not found.');
    if (!input.items || input.items.length === 0) {
      throw new Error('Invoice must include at least one line item.');
    }

    const customer = await tx.get<{ id: number; name: string }>('SELECT id, name FROM customers WHERE id = ?', [
      input.customerId,
    ]);
    if (!customer) throw new Error('Customer not found.');

    const org = await getOrganization(tx);
    const computed = computeInvoiceTotals(input.items, org.vatMode);
    const existingPaid = roundMoney(Number(existing.paid_amount));
    if (computed.grandTotal + 0.005 < existingPaid) {
      throw new Error(
        `Updated invoice total (${computed.grandTotal}) cannot be lower than already collected amount (${existingPaid}).`
      );
    }

    const invoiceNumber = String(existing.invoice_number);
    const oldBranchId = Number(existing.branch_id);

    await safeReverseIfPosted(
      tx,
      existing.journal_entry_id ? Number(existing.journal_entry_id) : null,
      `Auto-reversal for edit of ${invoiceNumber}`,
      actor
    );

    const oldMoves = await tx.all<{ product_id: number; quantity: number; unit_cost: number }>(
      `SELECT product_id, quantity, unit_cost FROM stock_movements
       WHERE source_type = 'invoice' AND source_id = ? AND movement_type = 'out'`,
      [invoiceId]
    );
    for (const mv of oldMoves) {
      await restoreBranchStockFromSale(
        tx,
        oldBranchId,
        Number(mv.product_id),
        Number(mv.quantity),
        Number(mv.unit_cost),
        invoiceId,
        `Stock restored before edit of ${invoiceNumber}`
      );
    }
    await tx.run(
      `UPDATE stock_movements SET source_type = 'invoice_superseded'
       WHERE source_type = 'invoice' AND source_id = ? AND movement_type = 'out'`,
      [invoiceId]
    );

    await tx.run('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);

    let totalCogs = 0;
    for (const line of computed.lines) {
      await tx.run(
        `INSERT INTO invoice_items (
          invoice_id, product_id, description, quantity, unit_price, discount_amount,
          tax_rule_id, tax_rate, sd_rate, taxable_value, sd_amount, vat_amount, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
          line.lineTotal,
        ]
      );

      if (line.productId) {
        const prod = await tx.get<{ id: number; track_inventory: number; cost_price: number }>(
          'SELECT id, track_inventory, cost_price FROM products WHERE id = ?',
          [line.productId]
        );
        if (prod && prod.track_inventory) {
          const stockRow = await tx.get<{ id: number; quantity: number; avg_cost: number; fifo_lots_json: string }>(
            'SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?',
            [input.branchId, prod.id]
          );

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
            await tx.run('UPDATE branch_stock SET quantity = ?, fifo_lots_json = ? WHERE id = ?', [
              cogsResult.remainingQty,
              JSON.stringify(cogsResult.remainingLots || []),
              stockRow.id,
            ]);
          } else {
            await tx.run(
              'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)',
              [input.branchId, prod.id, cogsResult.remainingQty, currentAvg, '[]']
            );
          }

          await tx.run(
            `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
             VALUES (?, ?, 'out', ?, ?, ?, 'invoice', ?, ?, ?)`,
            [
              input.branchId,
              prod.id,
              line.quantity,
              cogsResult.effectiveUnitCost,
              cogsResult.cogsTotal,
              invoiceId,
              input.issueDate,
              `Updated invoice ${invoiceNumber}`,
            ]
          );
        }
      }
    }

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

    const newJournalId = await postJournalEntry(tx, {
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
    await tx.run(
      `UPDATE invoices SET
        branch_id = ?, customer_id = ?, issue_date = ?, due_date = ?, status = ?,
        subtotal = ?, discount_total = ?, sd_total = ?, vat_total = ?, grand_total = ?,
        notes = ?, journal_entry_id = ?
       WHERE id = ?`,
      [
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
        invoiceId,
      ]
    );

    await tx.run("UPDATE documents SET party_name = ?, amount = ? WHERE entity_type = 'invoice' AND entity_id = ?", [
      customer.name,
      computed.grandTotal,
      invoiceId,
    ]);

    await writeAuditLog(
      tx,
      actor,
      'INVOICE_UPDATED',
      'invoice',
      invoiceId,
      `Updated invoice ${invoiceNumber} for ${customer.name} (total ${computed.grandTotal}) with automatic journal re-posting`
    );

    return (await getInvoiceById(tx, invoiceId))!;
  });
}

export async function deletePaymentTransaction(
  db: DbClient,
  paymentId: number,
  actor: ActorContext
): Promise<{ deletedId: number; reversedJournalId: number | null }> {
  return db.transaction(async (tx) => {
    const pay = await tx.get<Record<string, unknown>>('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!pay) throw new Error('Payment not found.');

    const paymentNumber = String(pay.payment_number);
    const reversedJournalId = await safeReverseIfPosted(
      tx,
      pay.journal_entry_id ? Number(pay.journal_entry_id) : null,
      `Auto-reversal on delete of payment ${paymentNumber}`,
      actor
    );

    const allocs = await tx.all<{ invoice_id: number; amount: number }>(
      'SELECT invoice_id, amount FROM payment_allocations WHERE payment_id = ?',
      [paymentId]
    );

    const today = todayISO();
    for (const alloc of allocs) {
      const inv = await tx.get<{ id: number; grand_total: number; paid_amount: number; due_date: string }>(
        'SELECT id, grand_total, paid_amount, due_date FROM invoices WHERE id = ?',
        [alloc.invoice_id]
      );
      if (inv) {
        const nextPaid = Math.max(0, roundMoney(Number(inv.paid_amount) - Number(alloc.amount)));
        const nextStatus = resolveInvoiceStatus({
          grandTotal: Number(inv.grand_total),
          paidAmount: nextPaid,
          dueDate: inv.due_date,
          today,
        });
        await tx.run('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?', [nextPaid, nextStatus, inv.id]);
      }
    }

    await tx.run("DELETE FROM documents WHERE entity_type = 'payment' AND entity_id = ?", [paymentId]);
    await tx.run('DELETE FROM payments WHERE id = ?', [paymentId]);

    await writeAuditLog(
      tx,
      actor,
      'PAYMENT_DELETED',
      'payment',
      paymentId,
      `Deleted payment ${paymentNumber} (${pay.amount}) with automatic journal reversal and invoice balance restore`
    );
    return { deletedId: paymentId, reversedJournalId };
  });
}

export async function updatePaymentTransaction(
  db: DbClient,
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
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<Record<string, unknown>>('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!existing) throw new Error('Payment not found.');

    const nextAmount = roundMoney(Number(input.amount));
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const paymentNumber = String(existing.payment_number);
    const customerId = Number(existing.customer_id);
    const branchId = input.branchId ? Number(input.branchId) : Number(existing.branch_id);
    const customer = await tx.get<{ name: string }>('SELECT name FROM customers WHERE id = ?', [customerId]);

    await safeReverseIfPosted(
      tx,
      existing.journal_entry_id ? Number(existing.journal_entry_id) : null,
      `Auto-reversal for edit of payment ${paymentNumber}`,
      actor
    );

    const oldAllocs = await tx.all<{ invoice_id: number; amount: number }>(
      'SELECT invoice_id, amount FROM payment_allocations WHERE payment_id = ?',
      [paymentId]
    );
    const today = todayISO();
    const preferredInvoiceId = oldAllocs.length === 1 ? Number(oldAllocs[0].invoice_id) : null;

    for (const alloc of oldAllocs) {
      const inv = await tx.get<{ id: number; grand_total: number; paid_amount: number; due_date: string }>(
        'SELECT id, grand_total, paid_amount, due_date FROM invoices WHERE id = ?',
        [alloc.invoice_id]
      );
      if (inv) {
        const unwoundPaid = Math.max(0, roundMoney(Number(inv.paid_amount) - Number(alloc.amount)));
        const nextStatus = resolveInvoiceStatus({
          grandTotal: Number(inv.grand_total),
          paidAmount: unwoundPaid,
          dueDate: inv.due_date,
          today,
        });
        await tx.run('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?', [
          unwoundPaid,
          nextStatus,
          inv.id,
        ]);
      }
    }
    await tx.run('DELETE FROM payment_allocations WHERE payment_id = ?', [paymentId]);

    const openInvoices = await tx.all<{
      id: number;
      invoiceNumber: string;
      issueDate: string;
      dueDate: string;
      grandTotal: number;
      paidAmount: number;
    }>(
      `SELECT id, invoice_number as invoiceNumber, issue_date as issueDate, due_date as dueDate, grand_total as grandTotal, paid_amount as paidAmount
       FROM invoices WHERE customer_id = ? AND status != 'void' AND grand_total > paid_amount + 0.005
       ORDER BY issue_date ASC, id ASC`,
      [customerId]
    );

    const allocated = allocatePayment(
      nextAmount,
      openInvoices.map((inv) => ({
        id: Number(inv.id),
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        balanceDue: roundMoney(Number(inv.grandTotal) - Number(inv.paidAmount)),
      })),
      preferredInvoiceId ?? undefined
    );
    for (const item of allocated.allocations) {
      await tx.run('INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES (?, ?, ?)', [
        paymentId,
        item.invoiceId,
        item.amount,
      ]);
      const target = openInvoices.find((inv) => Number(inv.id) === item.invoiceId)!;
      const newPaid = roundMoney(Number(target.paidAmount) + item.amount);
      const newStatus = resolveInvoiceStatus({
        grandTotal: Number(target.grandTotal),
        paidAmount: newPaid,
        dueDate: target.dueDate,
        today,
      });
      await tx.run('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?', [
        newPaid,
        newStatus,
        item.invoiceId,
      ]);
    }

    const cashAcc = paymentMethodToAccountCode(input.method);
    const newJournalId = await postJournalEntry(tx, {
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

    await tx.run(
      `UPDATE payments SET
        branch_id = ?, payment_date = ?, amount = ?, method = ?,
        gateway_provider = ?, gateway_reference = ?, notes = ?, journal_entry_id = ?
       WHERE id = ?`,
      [
        branchId,
        input.paymentDate,
        nextAmount,
        input.method,
        input.gatewayProvider ?? existing.gateway_provider ?? null,
        input.gatewayReference ?? existing.gateway_reference ?? null,
        String(input.notes ?? existing.notes ?? '').trim(),
        newJournalId,
        paymentId,
      ]
    );

    await tx.run("UPDATE documents SET amount = ? WHERE entity_type = 'payment' AND entity_id = ?", [
      nextAmount,
      paymentId,
    ]);

    await writeAuditLog(
      tx,
      actor,
      'PAYMENT_UPDATED',
      'payment',
      paymentId,
      `Updated payment ${paymentNumber} to ${nextAmount} (${input.method}) with automatic journal re-posting`
    );
    return { id: paymentId };
  });
}

export async function deletePurchaseTransaction(
  db: DbClient,
  purchaseId: number,
  actor: ActorContext
): Promise<{ deletedId: number; reversedJournalId: number | null }> {
  return db.transaction(async (tx) => {
    const pur = await tx.get<Record<string, unknown>>('SELECT * FROM purchases WHERE id = ?', [purchaseId]);
    if (!pur) throw new Error('Purchase bill not found.');

    const billNumber = String(pur.bill_number);
    const branchId = Number(pur.branch_id);
    const items = await tx.all<{ product_id: number; quantity: number; unit_cost: number }>(
      'SELECT product_id, quantity, unit_cost FROM purchase_items WHERE purchase_id = ?',
      [purchaseId]
    );

    for (const item of items) {
      const prod = await tx.get<{ name: string; track_inventory: number }>(
        'SELECT name, track_inventory FROM products WHERE id = ?',
        [item.product_id]
      );
      if (!prod || !prod.track_inventory) continue;
      const stock = await tx.get<{ id: number; quantity: number }>(
        'SELECT id, quantity FROM branch_stock WHERE branch_id = ? AND product_id = ?',
        [branchId, item.product_id]
      );
      const currentQty = stock ? Number(stock.quantity) : 0;
      if (currentQty + 0.0001 < Number(item.quantity)) {
        throw new Error(
          `Cannot delete purchase ${billNumber}: only ${currentQty} units of "${prod.name}" remain in branch stock (purchased ${item.quantity}).`
        );
      }
    }

    const reversedJournalId = await safeReverseIfPosted(
      tx,
      pur.journal_entry_id ? Number(pur.journal_entry_id) : null,
      `Auto-reversal on delete of purchase ${billNumber}`,
      actor
    );

    for (const item of items) {
      const prod = await tx.get<{ track_inventory: number }>('SELECT track_inventory FROM products WHERE id = ?', [
        item.product_id,
      ]);
      if (!prod || !prod.track_inventory) continue;
      const stock = await tx.get<{ id: number; quantity: number }>(
        'SELECT id, quantity FROM branch_stock WHERE branch_id = ? AND product_id = ?',
        [branchId, item.product_id]
      );
      if (stock) {
        const nextQty = Math.max(0, roundMoney(Number(stock.quantity) - Number(item.quantity)));
        await tx.run('UPDATE branch_stock SET quantity = ? WHERE id = ?', [nextQty, stock.id]);
      }
      await tx.run(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
         VALUES (?, ?, 'out', ?, ?, ?, 'purchase_reversal', ?, ?, ?)`,
        [
          branchId,
          item.product_id,
          item.quantity,
          item.unit_cost,
          roundMoney(Number(item.quantity) * Number(item.unit_cost)),
          purchaseId,
          todayISO(),
          `Stock reversed on delete of ${billNumber}`,
        ]
      );
    }

    await tx.run("DELETE FROM documents WHERE entity_type = 'purchase' AND entity_id = ?", [purchaseId]);
    await tx.run('DELETE FROM purchases WHERE id = ?', [purchaseId]);

    await writeAuditLog(
      tx,
      actor,
      'PURCHASE_DELETED',
      'purchase',
      purchaseId,
      `Deleted purchase ${billNumber} with automatic journal reversal & stock adjustment`
    );
    return { deletedId: purchaseId, reversedJournalId };
  });
}

export async function updatePurchaseTransaction(
  db: DbClient,
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
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<Record<string, unknown>>('SELECT * FROM purchases WHERE id = ?', [purchaseId]);
    if (!existing) throw new Error('Purchase bill not found.');
    if (!input.items || input.items.length === 0) {
      throw new Error('Purchase must contain at least one item.');
    }

    const vendor = await tx.get<{ id: number; name: string }>('SELECT id, name FROM vendors WHERE id = ?', [
      input.vendorId,
    ]);
    if (!vendor) throw new Error('Vendor not found.');

    const billNumber = String(existing.bill_number);
    const oldBranchId = Number(existing.branch_id);
    const oldItems = await tx.all<{ product_id: number; quantity: number; unit_cost: number }>(
      'SELECT product_id, quantity, unit_cost FROM purchase_items WHERE purchase_id = ?',
      [purchaseId]
    );

    await safeReverseIfPosted(
      tx,
      existing.journal_entry_id ? Number(existing.journal_entry_id) : null,
      `Auto-reversal for edit of purchase ${billNumber}`,
      actor
    );

    for (const item of oldItems) {
      const stock = await tx.get<{ id: number; quantity: number }>(
        'SELECT id, quantity FROM branch_stock WHERE branch_id = ? AND product_id = ?',
        [oldBranchId, item.product_id]
      );
      if (stock) {
        const nextQty = Math.max(0, roundMoney(Number(stock.quantity) - Number(item.quantity)));
        await tx.run('UPDATE branch_stock SET quantity = ? WHERE id = ?', [nextQty, stock.id]);
      }
      await tx.run(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
         VALUES (?, ?, 'out', ?, ?, ?, 'purchase_reversal', ?, ?, ?)`,
        [
          oldBranchId,
          item.product_id,
          item.quantity,
          item.unit_cost,
          roundMoney(Number(item.quantity) * Number(item.unit_cost)),
          purchaseId,
          todayISO(),
          `Stock unwound before edit of ${billNumber}`,
        ]
      );
    }

    await tx.run('DELETE FROM purchase_items WHERE purchase_id = ?', [purchaseId]);

    let subtotal = 0;
    let vatTotal = 0;
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

      await tx.run(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, vat_rate, vat_amount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [purchaseId, item.productId, qty, cost, vatRate, lineVat, lineTotal]
      );

      const stockRow = await tx.get<{ id: number; quantity: number; avg_cost: number; fifo_lots_json: string }>(
        'SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?',
        [input.branchId, item.productId]
      );
      const curQty = stockRow ? Number(stockRow.quantity) : 0;
      const curAvg = stockRow ? Number(stockRow.avg_cost) : cost;
      const curLots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];
      const updated = computeWeightedAvgStockIn(curQty, curAvg, qty, cost);
      const nextLots = [...curLots, { qty, unitCost: cost }];

      if (stockRow) {
        await tx.run('UPDATE branch_stock SET quantity = ?, avg_cost = ?, fifo_lots_json = ? WHERE id = ?', [
          updated.newQty,
          updated.newAvgCost,
          JSON.stringify(nextLots),
          stockRow.id,
        ]);
      } else {
        await tx.run(
          'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)',
          [input.branchId, item.productId, updated.newQty, updated.newAvgCost, JSON.stringify(nextLots)]
        );
      }

      await tx.run('UPDATE products SET cost_price = ? WHERE id = ?', [cost, item.productId]);
      await tx.run(
        `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
         VALUES (?, ?, 'in', ?, ?, ?, 'purchase', ?, ?, ?)`,
        [input.branchId, item.productId, qty, cost, lineSub, purchaseId, input.purchaseDate, `Updated ${billNumber}`]
      );
    }

    const grandTotal = roundMoney(subtotal + vatTotal);
    const creditAccount = input.payImmediately ? paymentMethodToAccountCode(input.paymentMethod || 'bank') : '2000';
    const journalLines: JournalLine[] = [
      { accountCode: '1200', debit: subtotal, credit: 0, memo: `Inventory purchase ${billNumber} (updated)` },
      { accountCode: creditAccount, debit: 0, credit: grandTotal, memo: `Purchase settlement ${billNumber}` },
    ];
    if (vatTotal > 0) {
      journalLines.push({ accountCode: '1300', debit: vatTotal, credit: 0, memo: `Input VAT ${billNumber}` });
    }

    const newJournalId = await postJournalEntry(tx, {
      entryDate: input.purchaseDate,
      branchId: input.branchId,
      sourceType: 'purchase',
      sourceId: purchaseId,
      description: `Purchase ${billNumber} (Updated) · ${vendor.name}`,
      lines: journalLines,
      actor,
    });

    await tx.run(
      `UPDATE purchases SET
        mushak_61_ref = ?, branch_id = ?, vendor_id = ?, purchase_date = ?,
        subtotal = ?, vat_total = ?, grand_total = ?, paid_amount = ?, status = ?,
        notes = ?, journal_entry_id = ?
       WHERE id = ?`,
      [
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
        purchaseId,
      ]
    );

    await tx.run("UPDATE documents SET party_name = ?, amount = ? WHERE entity_type = 'purchase' AND entity_id = ?", [
      vendor.name,
      grandTotal,
      purchaseId,
    ]);

    await writeAuditLog(
      tx,
      actor,
      'PURCHASE_UPDATED',
      'purchase',
      purchaseId,
      `Updated purchase ${billNumber} (${grandTotal}) with automatic journal re-posting`
    );
    return { id: purchaseId };
  });
}

export async function deleteExpenseTransaction(
  db: DbClient,
  expenseId: number,
  actor: ActorContext
): Promise<{ deletedId: number; reversedJournalId: number | null }> {
  return db.transaction(async (tx) => {
    const exp = await tx.get<Record<string, unknown>>('SELECT * FROM expenses WHERE id = ?', [expenseId]);
    if (!exp) throw new Error('Expense not found.');

    const expenseNumber = String(exp.expense_number);
    const reversedJournalId = await safeReverseIfPosted(
      tx,
      exp.journal_entry_id ? Number(exp.journal_entry_id) : null,
      `Auto-reversal on delete of expense ${expenseNumber}`,
      actor
    );

    await tx.run('DELETE FROM expenses WHERE id = ?', [expenseId]);
    await writeAuditLog(
      tx,
      actor,
      'EXPENSE_DELETED',
      'expense',
      expenseId,
      `Deleted expense ${expenseNumber} (${exp.category}, ${exp.total_amount}) with automatic journal reversal`
    );
    return { deletedId: expenseId, reversedJournalId };
  });
}

export async function updateExpenseTransaction(
  db: DbClient,
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
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<Record<string, unknown>>('SELECT * FROM expenses WHERE id = ?', [expenseId]);
    if (!existing) throw new Error('Expense not found.');

    const amount = roundMoney(Number(input.amount));
    const vatAmount = roundMoney(Math.max(0, Number(input.vatAmount) || 0));
    const totalAmount = roundMoney(amount + vatAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Expense amount must be greater than zero.');
    }

    const expenseNumber = String(existing.expense_number);
    await safeReverseIfPosted(
      tx,
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

    const newJournalId = await postJournalEntry(tx, {
      entryDate: input.expenseDate,
      branchId: input.branchId,
      sourceType: 'expense',
      sourceId: expenseId,
      description: `Expense ${expenseNumber} (Updated) · ${input.category}`,
      lines,
      actor,
    });

    await tx.run(
      `UPDATE expenses SET
        branch_id = ?, expense_date = ?, category = ?, account_code = ?, vendor_name = ?,
        amount = ?, vat_amount = ?, total_amount = ?, payment_method = ?, reference = ?,
        notes = ?, journal_entry_id = ?
       WHERE id = ?`,
      [
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
        expenseId,
      ]
    );

    await writeAuditLog(
      tx,
      actor,
      'EXPENSE_UPDATED',
      'expense',
      expenseId,
      `Updated expense ${expenseNumber} (${input.category}, ${totalAmount}) with automatic journal re-posting`
    );
    return { id: expenseId };
  });
}

export async function updateRecurringProfile(
  db: DbClient,
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
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; branch_id: number }>(
      'SELECT id, branch_id FROM recurring_profiles WHERE id = ?',
      [id]
    );
    if (!existing) throw new Error('Recurring schedule not found.');
    if (!input.title || !input.title.trim()) throw new Error('Schedule title is required.');
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('At least one line item is required.');
    }

    const computed = computeInvoiceTotals(input.items, 'exclusive');
    await tx.run(
      `UPDATE recurring_profiles SET
        title = ?, customer_id = ?, branch_id = ?, frequency = ?, next_run_date = ?,
        items_json = ?, estimated_total = ?
       WHERE id = ?`,
      [
        input.title.trim(),
        Number(input.customerId),
        Number(input.branchId) || Number(existing.branch_id),
        input.frequency,
        input.nextRunDate,
        JSON.stringify(input.items),
        computed.grandTotal,
        id,
      ]
    );

    await writeAuditLog(
      tx,
      actor,
      'RECURRING_UPDATED',
      'recurring_profile',
      id,
      `Updated recurring schedule "${input.title.trim()}" (${input.frequency})`
    );
    return { id };
  });
}

export async function deleteRecurringProfile(
  db: DbClient,
  id: number,
  actor: ActorContext
): Promise<{ deletedId: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number; title: string }>(
      'SELECT id, title FROM recurring_profiles WHERE id = ?',
      [id]
    );
    if (!existing) throw new Error('Recurring schedule not found.');

    await tx.run('DELETE FROM recurring_profiles WHERE id = ?', [id]);
    await writeAuditLog(
      tx,
      actor,
      'RECURRING_DELETED',
      'recurring_profile',
      id,
      `Deleted recurring schedule "${existing.title}"`
    );
    return { deletedId: id };
  });
}
