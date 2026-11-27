import {
  assertJournalBalanced,
  buildReversalLines,
  generateFinancialReports,
  roundMoney,
} from '../../engine/accounting.ts';
import { resolveInvoiceStatus } from '../../engine/billing.ts';
import { formatDate, formatMoney, formatNumber, todayISO } from '../../engine/format.ts';
import { computeWeightedAvgStockIn, type StockLot } from '../../engine/inventory.ts';
import type {
  Account,
  AlertItem,
  AuditLog,
  Branch,
  Customer,
  DocumentRecord,
  InventoryMethod,
  Invoice,
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
  TaxMode,
  TaxRule,
  Vendor,
} from '../../engine/types.ts';
import { sanitizeCashMemoSettings } from '../../lib/cashMemoTemplates.ts';
import type { DbClient } from '../dbClient.ts';

export interface ActorContext {
  name: string;
  role: string;
}

const SEQUENCE_TABLES = new Set([
  'journal_entries',
  'invoices',
  'payments',
  'purchases',
  'expenses',
  'customers',
  'vendors',
  'products',
]);

export async function getAccountIdByCode(db: DbClient, code: string): Promise<number> {
  const row = await db.get<{ id: number }>('SELECT id FROM accounts WHERE code = ?', [code]);
  if (!row) throw new Error(`Account code "${code}" not found in Chart of Accounts.`);
  return Number(row.id);
}

export function paymentMethodToAccountCode(method: PaymentMethod): string {
  if (method === 'cash') return '1000';
  if (method === 'bank') return '1010';
  return '1020'; // bkash, nagad, rocket, sslcommerz, card
}

export async function nextSequence(db: DbClient, table: string): Promise<number> {
  if (!SEQUENCE_TABLES.has(table)) {
    throw new Error(`Invalid sequence table: ${table}`);
  }
  const row = await db.get<{ maxId: number }>(`SELECT COALESCE(MAX(id), 0) as maxId FROM ${table}`);
  return Number(row?.maxId || 0) + 1;
}

export async function writeAuditLog(
  db: DbClient,
  actor: ActorContext,
  action: string,
  entityType: string,
  entityId: string | number,
  summary: string
): Promise<void> {
  await db.run(
    `INSERT INTO audit_logs (actor_name, actor_role, action, entity_type, entity_id, summary)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actor.name, actor.role, action, entityType, String(entityId), summary]
  );
}

export async function postJournalEntry(
  db: DbClient,
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
): Promise<number> {
  const balanced = assertJournalBalanced(params.lines);
  const seq = await nextSequence(db, 'journal_entries');
  const year = params.entryDate.slice(0, 4) || String(new Date().getFullYear());
  const entryNumber = `JE-${year}-${String(seq).padStart(5, '0')}`;

  const info = await db.run(
    `INSERT INTO journal_entries (entry_number, entry_date, branch_id, source_type, source_id, description, status, reversal_of_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?)`,
    [
      entryNumber,
      params.entryDate,
      params.branchId,
      params.sourceType,
      params.sourceId,
      params.description,
      params.reversalOfId ?? null,
      params.actor.name,
    ]
  );

  const journalEntryId = Number(info.lastInsertRowid);
  for (const line of balanced.lines) {
    const accountId = line.accountId || (await getAccountIdByCode(db, line.accountCode));
    await db.run(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, memo)
       VALUES (?, ?, ?, ?, ?)`,
      [journalEntryId, accountId, line.debit, line.credit, line.memo || '']
    );
  }

  return journalEntryId;
}

export async function reverseJournalEntryInternal(
  db: DbClient,
  journalEntryId: number,
  reason: string,
  actor: ActorContext
): Promise<{ reversalJournalId: number }> {
  const original = await db.get<{
    id: number;
    entry_number: string;
    branch_id: number;
    status: string;
    description: string;
  }>('SELECT * FROM journal_entries WHERE id = ?', [journalEntryId]);

  if (!original) {
    throw new Error('Journal entry not found.');
  }
  if (original.status === 'reversed') {
    throw new Error('Journal entry has already been reversed.');
  }

  const lines = await db.all<JournalLine>(
    `SELECT jl.account_id as accountId, a.code as accountCode, jl.debit, jl.credit, jl.memo
     FROM journal_lines jl
     INNER JOIN accounts a ON a.id = jl.account_id
     WHERE jl.journal_entry_id = ?`,
    [journalEntryId]
  );

  const reversalLines = buildReversalLines(lines);

  await db.run("UPDATE journal_entries SET status = 'reversed' WHERE id = ?", [journalEntryId]);

  const reversalJournalId = await postJournalEntry(db, {
    entryDate: todayISO(),
    branchId: Number(original.branch_id),
    sourceType: 'reversal',
    sourceId: Number(original.id),
    description: `Reversal of ${original.entry_number}${reason ? `: ${reason}` : ''}`,
    lines: reversalLines,
    reversalOfId: Number(original.id),
    actor,
  });

  await writeAuditLog(
    db,
    actor,
    'JOURNAL_REVERSED',
    'journal_entry',
    Number(original.id),
    `Reversed ${original.entry_number} via immutable contra entry #${reversalJournalId}`
  );

  return { reversalJournalId };
}

export async function reverseJournalEntry(
  db: DbClient,
  journalEntryId: number,
  reason: string,
  actor: ActorContext
): Promise<{ reversalJournalId: number }> {
  return db.transaction((tx) => reverseJournalEntryInternal(tx, journalEntryId, reason, actor));
}

export async function safeReverseIfPosted(
  db: DbClient,
  journalEntryId: number | null | undefined,
  reason: string,
  actor: ActorContext
): Promise<number | null> {
  if (!journalEntryId) return null;
  const row = await db.get<{ id: number; status: string }>(
    'SELECT id, status FROM journal_entries WHERE id = ?',
    [journalEntryId]
  );
  if (!row || row.status !== 'posted') return null;
  const res = await reverseJournalEntryInternal(db, Number(row.id), reason, actor);
  return res.reversalJournalId;
}

export async function restoreBranchStockFromSale(
  db: DbClient,
  branchId: number,
  productId: number,
  qty: number,
  unitCost: number,
  sourceId: number,
  notes: string
): Promise<void> {
  if (qty <= 0) return;
  const stockRow = await db.get<{ id: number; quantity: number; avg_cost: number; fifo_lots_json: string }>(
    'SELECT id, quantity, avg_cost, fifo_lots_json FROM branch_stock WHERE branch_id = ? AND product_id = ?',
    [branchId, productId]
  );

  const currentQty = stockRow ? Number(stockRow.quantity) : 0;
  const currentAvg = stockRow ? Number(stockRow.avg_cost) : unitCost;
  const lots: StockLot[] = stockRow ? JSON.parse(stockRow.fifo_lots_json || '[]') : [];
  const next = computeWeightedAvgStockIn(currentQty, currentAvg, qty, unitCost);
  const nextLots: StockLot[] = [...lots, { qty, unitCost }];

  if (stockRow) {
    await db.run('UPDATE branch_stock SET quantity = ?, avg_cost = ?, fifo_lots_json = ? WHERE id = ?', [
      next.newQty,
      next.newAvgCost,
      JSON.stringify(nextLots),
      stockRow.id,
    ]);
  } else {
    await db.run(
      'INSERT INTO branch_stock (branch_id, product_id, quantity, avg_cost, fifo_lots_json) VALUES (?, ?, ?, ?, ?)',
      [branchId, productId, next.newQty, next.newAvgCost, JSON.stringify(nextLots)]
    );
  }

  await db.run(
    `INSERT INTO stock_movements (branch_id, product_id, movement_type, quantity, unit_cost, total_cost, source_type, source_id, movement_date, notes)
     VALUES (?, ?, 'in', ?, ?, ?, 'invoice_reversal', ?, ?, ?)`,
    [branchId, productId, qty, unitCost, roundMoney(qty * unitCost), sourceId, todayISO(), notes]
  );
}

export async function getOrganization(db: DbClient, envAdminPasscodeSet = false): Promise<Organization> {
  const row = await db.get<Record<string, unknown>>('SELECT * FROM organizations WHERE id = 1');
  if (!row) {
    throw new Error('Organization record is not initialized.');
  }
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
    name: String(row.name || ''),
    nameBn: String(row.name_bn || ''),
    binNumber: String(row.bin_number || ''),
    tinNumber: String(row.tin_number || ''),
    phone: String(row.phone || ''),
    email: String(row.email || ''),
    address: String(row.address || ''),
    currency: String(row.currency || 'BDT'),
    currencySymbol: String(row.currency_symbol || '৳'),
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
    adminLockEnabled: Boolean(row.admin_password_hash || envAdminPasscodeSet),
  };
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

export async function getInvoiceById(db: DbClient, id: number): Promise<Invoice | null> {
  const row = await db.get<Record<string, unknown>>(
    `SELECT i.*,
            b.name as branch_name, b.name_bn as branch_name_bn,
            b.address as branch_address, b.phone as branch_phone,
            c.code as customer_code, c.name as customer_name,
            c.company_name as customer_company_name, c.bin_number as customer_bin,
            c.address as customer_address, c.phone as customer_phone, c.email as customer_email
     FROM invoices i
     INNER JOIN branches b ON b.id = i.branch_id
     INNER JOIN customers c ON c.id = i.customer_id
     WHERE i.id = ?`,
    [id]
  );

  if (!row) return null;

  const items = await db.all<NonNullable<Invoice['items']>[number]>(
    `SELECT ii.product_id as productId,
            COALESCE(p.sku, '') as productSku,
            COALESCE(p.unit, '') as productUnit,
            ii.description, ii.quantity, ii.unit_price as unitPrice,
            ii.discount_amount as discountAmount, ii.tax_rule_id as taxRuleId, ii.tax_rate as taxRate,
            ii.sd_rate as sdRate, ii.taxable_value as taxableValue, ii.sd_amount as sdAmount,
            ii.vat_amount as vatAmount, ii.line_total as lineTotal
     FROM invoice_items ii
     LEFT JOIN products p ON p.id = ii.product_id
     WHERE ii.invoice_id = ?`,
    [id]
  );

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

export async function listCustomersWithBalances(db: DbClient): Promise<Customer[]> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT c.*,
            COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = c.id AND status != 'void'), 0) as total_invoiced,
            COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = c.id), 0) as total_paid
     FROM customers c
     ORDER BY c.id DESC`
  );

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

export async function listProductsWithStock(db: DbClient, branchId?: number): Promise<Product[]> {
  const rows = await db.all<Record<string, unknown>>(
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
     ORDER BY p.id ASC`,
    [branchId ?? null, branchId ?? null, branchId ?? null, branchId ?? null]
  );

  const allBranches = await db.all<{ id: number; code: string; name: string; name_bn: string }>(
    'SELECT id, code, name, name_bn FROM branches ORDER BY is_main DESC, id ASC'
  );

  const stockRows = await db.all<{
    branch_id: number;
    product_id: number;
    quantity: number;
    avg_cost: number;
  }>('SELECT branch_id, product_id, quantity, avg_cost FROM branch_stock');

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
        branchId: Number(b.id),
        branchCode: String(b.code),
        branchName: String(b.name),
        branchNameBn: String(b.name_bn),
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

export async function computeReportsFromLedger(db: DbClient, branchId?: number) {
  const accounts = await db.all<Account>(
    'SELECT id, code, name, name_bn as nameBn, type, is_system as isSystem FROM accounts ORDER BY code ASC'
  );

  const postedLines = branchId
    ? await db.all<{
        accountCode: string;
        accountName: string;
        accountNameBn: string;
        accountType: Account['type'];
        debit: number;
        credit: number;
        sourceType: string;
      }>(
        `SELECT a.code as accountCode, a.name as accountName, a.name_bn as accountNameBn,
                a.type as accountType, jl.debit, jl.credit, je.source_type as sourceType
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN accounts a ON a.id = jl.account_id
         WHERE je.branch_id = ?`,
        [branchId]
      )
    : await db.all<{
        accountCode: string;
        accountName: string;
        accountNameBn: string;
        accountType: Account['type'];
        debit: number;
        credit: number;
        sourceType: string;
      }>(
        `SELECT a.code as accountCode, a.name as accountName, a.name_bn as accountNameBn,
                a.type as accountType, jl.debit, jl.credit, je.source_type as sourceType
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN accounts a ON a.id = jl.account_id`
      );

  const invAgg = branchId
    ? await db.get<{ taxableSales: number; sdPayable: number; challanCount: number }>(
        `SELECT COALESCE(SUM(subtotal), 0) as taxableSales, COALESCE(SUM(sd_total), 0) as sdPayable, COUNT(*) as challanCount
         FROM invoices WHERE status != 'void' AND branch_id = ?`,
        [branchId]
      )
    : await db.get<{ taxableSales: number; sdPayable: number; challanCount: number }>(
        `SELECT COALESCE(SUM(subtotal), 0) as taxableSales, COALESCE(SUM(sd_total), 0) as sdPayable, COUNT(*) as challanCount
         FROM invoices WHERE status != 'void'`
      );

  const purAgg = branchId
    ? await db.get<{ taxablePurchases: number }>(
        `SELECT COALESCE(SUM(subtotal), 0) as taxablePurchases FROM purchases WHERE status != 'void' AND branch_id = ?`,
        [branchId]
      )
    : await db.get<{ taxablePurchases: number }>(
        `SELECT COALESCE(SUM(subtotal), 0) as taxablePurchases FROM purchases WHERE status != 'void'`
      );

  return generateFinancialReports(accounts, postedLines, {
    taxableSales: Number(invAgg?.taxableSales || 0),
    taxablePurchases: Number(purAgg?.taxablePurchases || 0),
    sdPayable: Number(invAgg?.sdPayable || 0),
    challanCount: Number(invAgg?.challanCount || 0),
  });
}

export async function computeSystemAlerts(db: DbClient, branchId?: number): Promise<AlertItem[]> {
  const alerts: AlertItem[] = [];
  const today = todayISO();

  const overdueRows = branchId
    ? await db.all<{ id: number; invoice_number: string; due_date: string; due: number; customer_name: string }>(
        `SELECT i.id, i.invoice_number, i.due_date, ROUND(i.grand_total - i.paid_amount, 2) as due, c.name as customer_name
         FROM invoices i INNER JOIN customers c ON c.id = i.customer_id
         WHERE i.status NOT IN ('paid','void','draft') AND i.due_date < ? AND ROUND(i.grand_total - i.paid_amount, 2) > 0 AND i.branch_id = ?`,
        [today, branchId]
      )
    : await db.all<{ id: number; invoice_number: string; due_date: string; due: number; customer_name: string }>(
        `SELECT i.id, i.invoice_number, i.due_date, ROUND(i.grand_total - i.paid_amount, 2) as due, c.name as customer_name
         FROM invoices i INNER JOIN customers c ON c.id = i.customer_id
         WHERE i.status NOT IN ('paid','void','draft') AND i.due_date < ? AND ROUND(i.grand_total - i.paid_amount, 2) > 0`,
        [today]
      );

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
      entityId: Number(ov.id),
    });
  }

  const products = await listProductsWithStock(db, branchId);
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

  const recurringDue = await db.all<{ id: number; title: string; next_run_date: string; customer_name: string }>(
    `SELECT r.id, r.title, r.next_run_date, c.name as customer_name
     FROM recurring_profiles r INNER JOIN customers c ON c.id = r.customer_id
     WHERE r.status = 'active' AND r.next_run_date <= ?`,
    [today]
  );

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
      entityId: Number(rec.id),
    });
  }

  return alerts;
}

export async function listAllWorkspaceData(
  db: DbClient,
  branchId?: number,
  envAdminPasscodeSet = false
) {
  const organization = await getOrganization(db, envAdminPasscodeSet);
  const branchesRaw = await db.all<Record<string, unknown>>(
    'SELECT id, code, name, name_bn as nameBn, address, phone, is_main as isMain, is_active as isActive FROM branches ORDER BY is_main DESC, id ASC'
  );
  const branches: Branch[] = branchesRaw.map((b) => ({
    id: Number(b.id),
    code: String(b.code),
    name: String(b.name),
    nameBn: String(b.nameBn),
    address: String(b.address || ''),
    phone: String(b.phone || ''),
    isMain: Boolean(b.isMain),
    isActive: Boolean(b.isActive),
  }));

  const taxRulesRaw = await db.all<Record<string, unknown>>(
    `SELECT id, code, name, name_bn as nameBn, rate, sd_rate as sdRate, mushak_category as mushakCategory,
            effective_from as effectiveFrom, effective_to as effectiveTo, is_default as isDefault, is_active as isActive
     FROM tax_rules ORDER BY is_default DESC, rate DESC`
  );
  const taxRules: TaxRule[] = taxRulesRaw.map((r) => ({
    id: Number(r.id),
    code: String(r.code),
    name: String(r.name),
    nameBn: String(r.nameBn),
    rate: Number(r.rate),
    sdRate: Number(r.sdRate || 0),
    mushakCategory: r.mushakCategory as TaxRule['mushakCategory'],
    effectiveFrom: String(r.effectiveFrom),
    effectiveTo: r.effectiveTo ? String(r.effectiveTo) : null,
    isDefault: Boolean(r.isDefault),
    isActive: Boolean(r.isActive),
  }));

  const accounts = await db.all<Account>(
    'SELECT id, code, name, name_bn as nameBn, type, is_system as isSystem FROM accounts ORDER BY code ASC'
  );
  const customers = await listCustomersWithBalances(db);
  const vendorRows = await db.all<Record<string, unknown>>(
    `SELECT v.*, COALESCE((SELECT SUM(grand_total - paid_amount) FROM purchases WHERE vendor_id = v.id AND status != 'void'), 0) as payable_balance
     FROM vendors v ORDER BY v.id DESC`
  );
  const vendors: Vendor[] = vendorRows.map((row) => ({
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
  }));

  const products = await listProductsWithStock(db, branchId);

  const invoiceIds = branchId
    ? await db.all<{ id: number }>(
        'SELECT id FROM invoices WHERE branch_id = ? ORDER BY issue_date DESC, id DESC',
        [branchId]
      )
    : await db.all<{ id: number }>('SELECT id FROM invoices ORDER BY issue_date DESC, id DESC');

  const invoices: Invoice[] = [];
  for (const r of invoiceIds) {
    const inv = await getInvoiceById(db, Number(r.id));
    if (inv) invoices.push(inv);
  }

  const paymentRows = branchId
    ? await db.all<Record<string, unknown>>(
        `SELECT p.*, c.name as customer_name FROM payments p
         INNER JOIN customers c ON c.id = p.customer_id
         WHERE p.branch_id = ? ORDER BY p.payment_date DESC, p.id DESC`,
        [branchId]
      )
    : await db.all<Record<string, unknown>>(
        `SELECT p.*, c.name as customer_name FROM payments p
         INNER JOIN customers c ON c.id = p.customer_id
         ORDER BY p.payment_date DESC, p.id DESC`
      );

  const payments: Payment[] = [];
  for (const p of paymentRows) {
    const allocs = await db.all<{ invoiceId: number; invoiceNumber: string; amount: number }>(
      `SELECT pa.invoice_id as invoiceId, i.invoice_number as invoiceNumber, pa.amount
       FROM payment_allocations pa INNER JOIN invoices i ON i.id = pa.invoice_id
       WHERE pa.payment_id = ?`,
      [Number(p.id)]
    );
    payments.push({
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
    });
  }

  const purchaseRows = branchId
    ? await db.all<Record<string, unknown>>(
        `SELECT p.*, v.name as vendor_name, b.name as branch_name FROM purchases p
         INNER JOIN vendors v ON v.id = p.vendor_id
         INNER JOIN branches b ON b.id = p.branch_id
         WHERE p.branch_id = ? ORDER BY p.purchase_date DESC, p.id DESC`,
        [branchId]
      )
    : await db.all<Record<string, unknown>>(
        `SELECT p.*, v.name as vendor_name, b.name as branch_name FROM purchases p
         INNER JOIN vendors v ON v.id = p.vendor_id
         INNER JOIN branches b ON b.id = p.branch_id
         ORDER BY p.purchase_date DESC, p.id DESC`
      );

  const purchases: Purchase[] = [];
  for (const row of purchaseRows) {
    const pid = Number(row.id);
    const items = await db.all<NonNullable<Purchase['items']>[number]>(
      `SELECT id, product_id as productId, quantity, unit_cost as unitCost,
              vat_rate as vatRate, vat_amount as vatAmount, line_total as lineTotal
       FROM purchase_items WHERE purchase_id = ?`,
      [pid]
    );
    purchases.push({
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
    });
  }

  const expenseRows = branchId
    ? await db.all<Record<string, unknown>>(
        `SELECT e.*, b.name as branch_name FROM expenses e
         INNER JOIN branches b ON b.id = e.branch_id
         WHERE e.branch_id = ? ORDER BY e.expense_date DESC, e.id DESC`,
        [branchId]
      )
    : await db.all<Record<string, unknown>>(
        `SELECT e.*, b.name as branch_name FROM expenses e
         INNER JOIN branches b ON b.id = e.branch_id
         ORDER BY e.expense_date DESC, e.id DESC`
      );

  const expenses = expenseRows.map((row) => ({
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
  }));

  const journalRows = branchId
    ? await db.all<Record<string, unknown>>(
        'SELECT * FROM journal_entries WHERE branch_id = ? ORDER BY entry_date DESC, id DESC LIMIT 100',
        [branchId]
      )
    : await db.all<Record<string, unknown>>(
        'SELECT * FROM journal_entries ORDER BY entry_date DESC, id DESC LIMIT 100'
      );

  const journals: JournalEntry[] = [];
  for (const je of journalRows) {
    const lines = await db.all<JournalLine>(
      `SELECT jl.id, jl.account_id as accountId, a.code as accountCode, a.name as accountName,
              a.type as accountType, jl.debit, jl.credit, jl.memo
       FROM journal_lines jl INNER JOIN accounts a ON a.id = jl.account_id
       WHERE jl.journal_entry_id = ?`,
      [Number(je.id)]
    );
    journals.push({
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
    });
  }

  const recurringRows = await db.all<Record<string, unknown>>(
    `SELECT r.*, c.name as customer_name FROM recurring_profiles r
     INNER JOIN customers c ON c.id = r.customer_id ORDER BY r.next_run_date ASC`
  );
  const recurringProfiles: RecurringProfile[] = recurringRows.map((r) => ({
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

  const documents = await db.all<DocumentRecord>(
    `SELECT id, doc_type as docType, reference_number as referenceNumber, entity_type as entityType,
            entity_id as entityId, title, party_name as partyName, amount, issued_at as issuedAt
     FROM documents ORDER BY id DESC LIMIT 120`
  );

  const auditLogs = await db.all<AuditLog>(
    `SELECT id, actor_name as actorName, actor_role as actorRole, action,
            entity_type as entityType, entity_id as entityId, summary, created_at as createdAt
     FROM audit_logs ORDER BY id DESC LIMIT 100`
  );

  const users = await db.all<Record<string, unknown>>(
    `SELECT id, name, email, role, branch_id as branchId, is_active as isActive, created_at as createdAt
     FROM users ORDER BY id ASC`
  );

  const reports = await computeReportsFromLedger(db, branchId);
  const alerts = await computeSystemAlerts(db, branchId);

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
