import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPasswordAsync, verifyPasswordAsync } from '../authCore.ts';
import { handleApiRequest } from '../apiRouter.ts';
import { createInitializedNodeDbClient } from '../db.ts';
import { verifyLegacyScryptPassword } from '../nodeDbClient.ts';
import { seedBaselineConfigAsync } from '../schema.ts';
import {
  adjustProductStockTransaction,
  computeReportsFromLedger,
  createExpenseTransaction,
  createInvoiceTransaction,
  createPurchaseTransaction,
  deleteBranchRecord,
  deleteCustomerRecord,
  deleteExpenseTransaction,
  deleteInvoiceTransaction,
  deletePaymentTransaction,
  deleteProductRecord,
  deletePurchaseTransaction,
  deleteRecurringProfile,
  deleteTaxRule,
  deleteUserRecord,
  deleteVendorRecord,
  getCustomerStatementData,
  listAllWorkspaceData,
  listProductStockMovements,
  listProductsWithStock,
  onboardWorkspaceTransaction,
  recordPaymentTransaction,
  reverseJournalEntry,
  sanitizeProductImageUrl,
  seedSampleBusinessData,
  transferProductStockTransaction,
  updateBranchRecord,
  updateCustomerRecord,
  updateExpenseTransaction,
  updateInvoiceTransaction,
  updatePaymentTransaction,
  updateProductRecord,
  updatePurchaseTransaction,
  updateRecurringProfile,
  updateTaxRule,
  updateUserRecord,
  updateVendorRecord,
} from './engineService.ts';

const actor = { name: 'Test Owner', role: 'owner' };

async function createMemoryTestDb() {
  return createInitializedNodeDbClient(':memory:');
}

test('Seeded workspace transactions reconcile Trial Balance, Balance Sheet, and VAT Return', async () => {
  const { db } = await createMemoryTestDb();
  await seedSampleBusinessData(db, actor);

  const reports = await computeReportsFromLedger(db);
  assert.equal(reports.trialBalance.isBalanced, true);
  assert.equal(reports.balanceSheet.isBalanced, true);
  assert.ok(reports.trialBalance.totalDebit > 0);
  assert.equal(reports.trialBalance.totalDebit, reports.trialBalance.totalCredit);
  assert.equal(
    reports.balanceSheet.totalAssets,
    Number((reports.balanceSheet.totalLiabilities + reports.balanceSheet.totalEquity).toFixed(2))
  );
  assert.equal(
    reports.vatReturn.netVatPayable,
    Number((reports.vatReturn.outputVat - reports.vatReturn.inputVat).toFixed(2))
  );
});

test('Invoice idempotency prevents duplicate postings and deducts stock accurately', async () => {
  const { db } = await createMemoryTestDb();
  await seedSampleBusinessData(db, actor);

  const beforeStock = (await listProductsWithStock(db, 1)).find((p) => p.sku === 'TEX-101')!.stockQty!;
  const key = 'idem-test-inv-001';

  const first = await createInvoiceTransaction(
    db,
    {
      branchId: 1,
      customerId: 1,
      issueDate: '2026-11-24',
      dueDate: '2026-12-04',
      idempotencyKey: key,
      items: [
        {
          productId: 1,
          description: 'Combed Cotton Poplin (40m Roll)',
          quantity: 2,
          unitPrice: 6800,
          taxRuleId: 1,
          taxRate: 15,
        },
      ],
    },
    actor
  );

  const duplicate = await createInvoiceTransaction(
    db,
    {
      branchId: 1,
      customerId: 1,
      issueDate: '2026-11-24',
      dueDate: '2026-12-04',
      idempotencyKey: key,
      items: [
        {
          productId: 1,
          description: 'Combed Cotton Poplin (40m Roll)',
          quantity: 2,
          unitPrice: 6800,
          taxRuleId: 1,
          taxRate: 15,
        },
      ],
    },
    actor
  );

  assert.equal(first.id, duplicate.id);
  assert.equal(first.grandTotal, 15640);

  const afterStock = (await listProductsWithStock(db, 1)).find((p) => p.sku === 'TEX-101')!.stockQty!;
  assert.equal(afterStock, beforeStock - 2);

  await recordPaymentTransaction(
    db,
    {
      customerId: 1,
      branchId: 1,
      paymentDate: '2026-11-24',
      amount: 10000,
      method: 'bkash',
      gatewayProvider: 'bKash',
      gatewayReference: 'BKS-TEST-01',
      invoiceId: first.id,
    },
    actor
  );

  const statement = await getCustomerStatementData(db, 1);
  assert.ok(statement.rows.length >= 3);

  assert.ok(first.journalEntryId);
  await reverseJournalEntry(db, first.journalEntryId!, 'Test adjustment', actor);
  const reports = await computeReportsFromLedger(db);
  assert.equal(reports.trialBalance.isBalanced, true);
  assert.equal(reports.balanceSheet.isBalanced, true);
});

test('Purchase + Expense atomic postings keep ledger balanced', async () => {
  const { db } = await createMemoryTestDb();
  await seedSampleBusinessData(db, actor);

  await createPurchaseTransaction(
    db,
    {
      branchId: 1,
      vendorId: 1,
      purchaseDate: '2026-11-24',
      payImmediately: false,
      items: [{ productId: 1, quantity: 5, unitCost: 5000, vatRate: 15 }],
    },
    actor
  );

  await createExpenseTransaction(
    db,
    {
      branchId: 1,
      expenseDate: '2026-11-24',
      category: 'Courier & Delivery',
      accountCode: '5400',
      vendorName: 'Steadfast Logistics',
      amount: 2200,
      vatAmount: 110,
      paymentMethod: 'cash',
    },
    actor
  );

  const reports = await computeReportsFromLedger(db);
  assert.equal(reports.trialBalance.isBalanced, true);
  assert.equal(reports.balanceSheet.isBalanced, true);
});

test('Product image sanitizer accepts safe local/raster data URLs and blocks unsafe protocols/SVGs', () => {
  assert.equal(
    sanitizeProductImageUrl('/src/assets/images/product_cotton_poplin_1795659038539.jpg'),
    '/src/assets/images/product_cotton_poplin_1795659038539.jpg'
  );
  assert.equal(
    sanitizeProductImageUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='),
    'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  );
  assert.throws(() => sanitizeProductImageUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='));
  assert.throws(() => sanitizeProductImageUrl('javascript:alert(1)'));
  assert.throws(() => sanitizeProductImageUrl('https://evil.example.com/pixel.jpg'));
});

test('Product update, stock adjustment, and branch transfer remain atomic and balanced', async () => {
  const { db } = await createMemoryTestDb();
  await seedSampleBusinessData(db, actor);

  const products = await listProductsWithStock(db);
  const poplin = products.find((p) => p.sku === 'TEX-101')!;
  assert.ok(poplin.branchStocks && poplin.branchStocks.length >= 2);

  const updated = await updateProductRecord(
    db,
    poplin.id,
    {
      name: poplin.name,
      nameBn: poplin.nameBn,
      brand: 'Bengal Loom Premium',
      barcode: '8941101999991',
      salePrice: 7100,
      costPrice: poplin.costPrice,
      description: 'Updated 40m export poplin roll.',
    },
    actor
  );
  assert.equal(updated.id, poplin.id);
  const reloaded = (await listProductsWithStock(db)).find((p) => p.id === poplin.id)!;
  assert.equal(reloaded.brand, 'Bengal Loom Premium');
  assert.equal(reloaded.salePrice, 7100);

  const beforeB1 = (await listProductsWithStock(db, 1)).find((p) => p.id === poplin.id)!.stockQty!;
  await adjustProductStockTransaction(
    db,
    { productId: poplin.id, branchId: 1, mode: 'add', quantity: 4, reason: 'Physical stock count surplus' },
    actor
  );
  const afterAdjustB1 = (await listProductsWithStock(db, 1)).find((p) => p.id === poplin.id)!.stockQty!;
  assert.equal(afterAdjustB1, beforeB1 + 4);

  const beforeB2 = (await listProductsWithStock(db, 2)).find((p) => p.id === poplin.id)!.stockQty!;
  const transferRes = await transferProductStockTransaction(
    db,
    { productId: poplin.id, fromBranchId: 1, toBranchId: 2, quantity: 3, notes: 'Showroom replenishment' },
    actor
  );
  assert.equal(transferRes.transferredQty, 3);
  const afterTransferB1 = (await listProductsWithStock(db, 1)).find((p) => p.id === poplin.id)!.stockQty!;
  const afterTransferB2 = (await listProductsWithStock(db, 2)).find((p) => p.id === poplin.id)!.stockQty!;
  assert.equal(afterTransferB1, afterAdjustB1 - 3);
  assert.equal(afterTransferB2, beforeB2 + 3);

  const movements = await listProductStockMovements(db, poplin.id);
  assert.ok(movements.some((m) => m.sourceType === 'adjustment'));
  assert.ok(movements.some((m) => m.sourceType === 'transfer_out'));
  assert.ok(movements.some((m) => m.sourceType === 'transfer_in'));

  const reports = await computeReportsFromLedger(db);
  assert.equal(reports.trialBalance.isBalanced, true);
  assert.equal(reports.balanceSheet.isBalanced, true);
});

test('Universal financial Edit & Delete auto-reverses journals, restores stock, and keeps Trial Balance balanced', async () => {
  const { db } = await createMemoryTestDb();
  await seedSampleBusinessData(db, actor);

  const stockStart = (await listProductsWithStock(db, 1)).find((p) => p.sku === 'TEX-101')!.stockQty!;

  const inv = await createInvoiceTransaction(
    db,
    {
      branchId: 1,
      customerId: 1,
      issueDate: '2026-11-25',
      dueDate: '2026-12-05',
      items: [{ productId: 1, description: 'Cotton Poplin', quantity: 3, unitPrice: 6800, taxRuleId: 1, taxRate: 15 }],
    },
    actor
  );
  assert.equal((await listProductsWithStock(db, 1)).find((p) => p.sku === 'TEX-101')!.stockQty!, stockStart - 3);

  const editedInv = await updateInvoiceTransaction(
    db,
    inv.id,
    {
      branchId: 1,
      customerId: 1,
      issueDate: '2026-11-25',
      dueDate: '2026-12-10',
      items: [{ productId: 1, description: 'Cotton Poplin', quantity: 2, unitPrice: 7000, taxRuleId: 1, taxRate: 15 }],
    },
    actor
  );
  assert.equal(editedInv.grandTotal, 16100);
  assert.equal((await listProductsWithStock(db, 1)).find((p) => p.sku === 'TEX-101')!.stockQty!, stockStart - 2);

  const pay = await recordPaymentTransaction(
    db,
    {
      customerId: 1,
      branchId: 1,
      paymentDate: '2026-11-25',
      amount: 5000,
      method: 'bkash',
      invoiceId: inv.id,
    },
    actor
  );
  await updatePaymentTransaction(
    db,
    pay.id,
    {
      branchId: 1,
      paymentDate: '2026-11-25',
      amount: 6100,
      method: 'bank',
    },
    actor
  );
  const reloadedPay = (await listAllWorkspaceData(db)).payments.find((p) => p.id === pay.id)!;
  assert.equal(reloadedPay.amount, 6100);

  await deletePaymentTransaction(db, pay.id, actor);
  await deleteInvoiceTransaction(db, inv.id, actor);
  assert.equal((await listProductsWithStock(db, 1)).find((p) => p.sku === 'TEX-101')!.stockQty!, stockStart);

  const pur = await createPurchaseTransaction(
    db,
    {
      branchId: 1,
      vendorId: 1,
      purchaseDate: '2026-11-25',
      payImmediately: true,
      items: [{ productId: 1, quantity: 4, unitCost: 5000, vatRate: 15 }],
    },
    actor
  );
  assert.equal((await listProductsWithStock(db, 1)).find((p) => p.sku === 'TEX-101')!.stockQty!, stockStart + 4);
  await updatePurchaseTransaction(
    db,
    pur.id,
    {
      branchId: 1,
      vendorId: 1,
      purchaseDate: '2026-11-25',
      payImmediately: false,
      items: [{ productId: 1, quantity: 2, unitCost: 5200, vatRate: 15 }],
    },
    actor
  );
  assert.equal((await listProductsWithStock(db, 1)).find((p) => p.sku === 'TEX-101')!.stockQty!, stockStart + 2);
  await deletePurchaseTransaction(db, pur.id, actor);
  assert.equal((await listProductsWithStock(db, 1)).find((p) => p.sku === 'TEX-101')!.stockQty!, stockStart);

  const exp = await createExpenseTransaction(
    db,
    {
      branchId: 1,
      expenseDate: '2026-11-25',
      category: 'Office Supplies',
      accountCode: '5400',
      vendorName: 'Dhaka Paper Mart',
      amount: 1500,
      vatAmount: 75,
      paymentMethod: 'cash',
    },
    actor
  );
  await updateExpenseTransaction(
    db,
    exp.id,
    {
      branchId: 1,
      expenseDate: '2026-11-25',
      category: 'Office Supplies',
      accountCode: '5400',
      vendorName: 'Dhaka Paper Mart',
      amount: 2000,
      vatAmount: 100,
      paymentMethod: 'bank',
    },
    actor
  );
  const reloadedExp = (await listAllWorkspaceData(db)).expenses.find((e) => e.id === exp.id)!;
  assert.equal(reloadedExp.totalAmount, 2100);
  await deleteExpenseTransaction(db, exp.id, actor);

  const reports = await computeReportsFromLedger(db);
  assert.equal(reports.trialBalance.isBalanced, true);
  assert.equal(reports.balanceSheet.isBalanced, true);
});

test('Universal master-record Edit & Delete works for Customers, Vendors, Products, Recurring, Tax Rules, Branches, and Users', async () => {
  const { db } = await createMemoryTestDb();
  await seedSampleBusinessData(db, actor);

  const custRes = await db.run(
    'INSERT INTO customers (code, name, phone, email, address) VALUES (?, ?, ?, ?, ?)',
    ['CUST-T01', 'Test Customer', '+8801700000001', 'test@cust.bd', 'Banani, Dhaka']
  );
  const custId = Number(custRes.lastInsertRowid);
  await updateCustomerRecord(db, custId, { name: 'Test Customer Ltd', phone: '+8801700000002' }, actor);
  assert.equal((await listAllWorkspaceData(db)).customers.find((c) => c.id === custId)!.name, 'Test Customer Ltd');
  await deleteCustomerRecord(db, custId, actor);

  const vendRes = await db.run(
    'INSERT INTO vendors (code, name, phone, address) VALUES (?, ?, ?, ?)',
    ['VEND-T01', 'Test Vendor', '+8801800000001', 'Motijheel']
  );
  const vendId = Number(vendRes.lastInsertRowid);
  await updateVendorRecord(db, vendId, { name: 'Test Vendor Corp' }, actor);
  assert.equal((await listAllWorkspaceData(db)).vendors.find((v) => v.id === vendId)!.name, 'Test Vendor Corp');
  await deleteVendorRecord(db, vendId, actor);

  const prodRes = await db.run(
    'INSERT INTO products (sku, name, unit, sale_price, cost_price, track_inventory, reorder_level) VALUES (?, ?, ?, ?, ?, 1, 5)',
    ['TMP-999', 'Temp Sample Item', 'pcs', 500, 300]
  );
  await deleteProductRecord(db, Number(prodRes.lastInsertRowid), actor);

  const wsBefore = await listAllWorkspaceData(db);
  if (wsBefore.recurringProfiles.length > 0) {
    const rec = wsBefore.recurringProfiles[0];
    await updateRecurringProfile(
      db,
      rec.id,
      {
        title: 'Updated Monthly Service',
        customerId: rec.customerId,
        branchId: rec.branchId,
        frequency: rec.frequency,
        nextRunDate: rec.nextRunDate,
        items: rec.items,
      },
      actor
    );
    assert.equal(
      (await listAllWorkspaceData(db)).recurringProfiles.find((r) => r.id === rec.id)!.title,
      'Updated Monthly Service'
    );
    await deleteRecurringProfile(db, rec.id, actor);
  }

  const trRes = await db.run(
    'INSERT INTO tax_rules (code, name, name_bn, rate, mushak_category, effective_from) VALUES (?, ?, ?, ?, ?, ?)',
    ['VAT-T75', 'Custom 7.5%', 'কাস্টম ৭.৫%', 7.5, 'custom', '2026-07-01']
  );
  const trId = Number(trRes.lastInsertRowid);
  await updateTaxRule(db, trId, { code: 'VAT-T80', name: 'Custom 8%', rate: 8, effectiveFrom: '2026-07-01' }, actor);
  assert.equal((await listAllWorkspaceData(db)).taxRules.find((r) => r.id === trId)!.rate, 8);
  await deleteTaxRule(db, trId, actor);

  const brRes = await db.run(
    'INSERT INTO branches (code, name, name_bn, address) VALUES (?, ?, ?, ?)',
    ['SYL-03', 'Sylhet Depot', 'সিলেট ডিপো', 'Zindabazar']
  );
  const brId = Number(brRes.lastInsertRowid);
  await updateBranchRecord(db, brId, { code: 'SYL-03', name: 'Sylhet Hub', nameBn: 'সিলেট হাব' }, actor);
  assert.equal((await listAllWorkspaceData(db)).branches.find((b) => b.id === brId)!.name, 'Sylhet Hub');
  await deleteBranchRecord(db, brId, actor);

  const usrRes = await db.run(
    'INSERT INTO users (name, email, role, is_active) VALUES (?, ?, ?, 1)',
    ['Temp Cashier', 'temp.cashier@dhakatrade.com.bd', 'cashier']
  );
  const usrId = Number(usrRes.lastInsertRowid);
  await updateUserRecord(
    db,
    usrId,
    { name: 'Senior Cashier', email: 'temp.cashier@dhakatrade.com.bd', role: 'accountant' },
    actor
  );
  const updatedUserRow = await db.get<{ role: string }>('SELECT role FROM users WHERE id = ?', [usrId]);
  assert.equal(updatedUserRow?.role, 'accountant');
  await deleteUserRecord(db, usrId, 999999, actor);
});

test('Organization logo_url persists sanitized raster data URL and returns via listAllWorkspaceData', async () => {
  const { db } = await createMemoryTestDb();
  const safePng = sanitizeProductImageUrl('data:image/png;base64,iVBORw0KGgo=');
  await db.run('UPDATE organizations SET logo_url = ? WHERE id = 1', [safePng]);
  const ws = await listAllWorkspaceData(db);
  assert.equal(ws.organization.logoUrl, safePng);
});

test('Rocket MFS payment records cleanly to account 1020 and reconciles Trial Balance', async () => {
  const { db } = await createMemoryTestDb();
  await seedSampleBusinessData(db, actor);
  const payment = await recordPaymentTransaction(
    db,
    {
      customerId: 1,
      branchId: 1,
      paymentDate: '2026-11-26',
      amount: 2500,
      method: 'rocket',
      gatewayProvider: 'DBBL Rocket Gateway',
      gatewayReference: 'RKT-TEST-9911',
      notes: 'Dynamic Rocket QR collection',
    },
    actor
  );
  assert.equal(payment.method, 'rocket');
  assert.equal(payment.amount, 2500);
  const reports = await computeReportsFromLedger(db);
  assert.equal(reports.trialBalance.isBalanced, true);
  assert.equal(reports.balanceSheet.isBalanced, true);
});

test('Organization cash_memo_settings_json persists active template and per-template customizations', async () => {
  const { db } = await createMemoryTestDb();
  const payload = JSON.stringify({
    activeTemplateId: 'bengali-classic',
    thermalPaperWidth: '58mm',
    templates: {
      'bengali-classic': {
        proprietorLabel: 'প্রোপ্রাইটর: মোঃ আজাদ',
        defaultIncludeVat: false,
        primaryColor: '#991B1B',
      },
      'navy-amber': {
        slogan: 'Dhaka Wholesale Hub',
        defaultIncludeVat: true,
      },
    },
  });
  await db.run('UPDATE organizations SET cash_memo_settings_json = ? WHERE id = 1', [payload]);
  const ws = await listAllWorkspaceData(db);
  assert.equal(ws.organization.cashMemoSettings?.activeTemplateId, 'bengali-classic');
  assert.equal(ws.organization.cashMemoSettings?.thermalPaperWidth, '58mm');
  assert.equal(
    ws.organization.cashMemoSettings?.templates['bengali-classic']?.proprietorLabel,
    'প্রোপ্রাইটর: মোঃ আজাদ'
  );
  assert.equal(
    ws.organization.cashMemoSettings?.templates['navy-amber']?.slogan,
    'Dhaka Wholesale Hub'
  );
});

test('Organization single-source-of-truth fields persist and customer/branch edits auto-sync relationally into invoices', async () => {
  const { db } = await createMemoryTestDb();
  await seedSampleBusinessData(db, actor);

  await db.run(
    `UPDATE organizations
     SET proprietor_name = ?, tagline = ?, website = ?, business_description = ?
     WHERE id = 1`,
    [
      'প্রোঃ মোঃ আরিফুল ইসলাম',
      'বিশ্বস্ত টেক্সটাইল ও হোলসেল সরবরাহ',
      'www.dhakatrade.com.bd',
      'সকল প্রকার কটন ও গার্মেন্টস এক্সেসরিজ পাইকারি বিক্রয়।',
    ]
  );

  await updateCustomerRecord(
    db,
    1,
    {
      name: 'রহমান অ্যাপারেলস (আপডেটেড)',
      companyName: 'Rahman Apparel Group Ltd.',
      phone: '+880 1799-887766',
      email: 'billing@rahmanapparel.com.bd',
      binNumber: '009988776-0101',
      address: 'Sector 7, Uttara, Dhaka',
    },
    actor
  );

  await updateBranchRecord(
    db,
    1,
    {
      code: 'DHK',
      name: 'Dhaka Flagship Hub',
      nameBn: 'ঢাকা ফ্ল্যাগশিপ হাব',
      address: 'Road 11, Gulshan-1, Dhaka',
    },
    actor
  );

  const ws = await listAllWorkspaceData(db);
  assert.equal(ws.organization.proprietorName, 'প্রোঃ মোঃ আরিফুল ইসলাম');
  assert.equal(ws.organization.tagline, 'বিশ্বস্ত টেক্সটাইল ও হোলসেল সরবরাহ');
  assert.equal(ws.organization.website, 'www.dhakatrade.com.bd');
  assert.equal(ws.organization.businessDescription, 'সকল প্রকার কটন ও গার্মেন্টস এক্সেসরিজ পাইকারি বিক্রয়।');

  const inv = ws.invoices.find((i) => i.customerId === 1 && i.branchId === 1);
  assert.ok(inv, 'Expected invoice linked to customer 1 and branch 1');
  assert.equal(inv!.customerName, 'রহমান অ্যাপারেলস (আপডেটেড)');
  assert.equal(inv!.customerCompanyName, 'Rahman Apparel Group Ltd.');
  assert.equal(inv!.customerPhone, '+880 1799-887766');
  assert.equal(inv!.customerEmail, 'billing@rahmanapparel.com.bd');
  assert.equal(inv!.customerAddress, 'Sector 7, Uttara, Dhaka');
  assert.equal(inv!.branchNameBn, 'ঢাকা ফ্ল্যাগশিপ হাব');
  assert.ok(inv!.items && inv!.items.length > 0);
});

test('Fresh database starts with zero dummy data and onboardWorkspaceTransaction atomically provisions Owner, Organization, and Main Branch', async () => {
  const { db } = await createMemoryTestDb();
  const initialWs = await listAllWorkspaceData(db);

  assert.equal(initialWs.organization.name, '');
  assert.equal(initialWs.organization.nameBn, '');
  assert.equal(initialWs.users.length, 0);
  assert.equal(initialWs.branches.length, 0);
  assert.equal(initialWs.customers.length, 0);
  assert.equal(initialWs.products.length, 0);
  assert.equal(initialWs.invoices.length, 0);
  assert.ok(initialWs.accounts.length >= 15);
  assert.ok(initialWs.taxRules.length >= 5);

  const onboarded = await onboardWorkspaceTransaction(db, {
    ownerName: 'মোঃ আনসার আহম্মদ',
    ownerEmail: 'ansar@nupurenterprise.com',
    passwordHash: 'pbkdf2$100000$test$test',
    orgNameBn: 'মেসার্স নূপুর এন্টারপ্রাইজ',
    orgNameEn: 'M/S Nupur Enterprise',
    proprietorName: 'প্রোঃ মোঃ আনসার আহম্মদ',
    phone: '01711-223344',
    address: 'আমবাগ মধ্যপাড়া, কোনাবাড়ি, গাজীপুর',
    binNumber: '009876543-0101',
    tagline: 'রড, সিমেন্ট ও হার্ডওয়্যার পাইকারি বিক্রেতা',
    vatMode: 'exclusive',
    defaultLanguage: 'bn',
    branchNameBn: 'কোনাবাড়ি প্রধান শাখা',
    branchNameEn: 'Konabari Main Branch',
    branchCode: 'KNB',
  });

  assert.equal(onboarded.user.role, 'owner');
  assert.equal(onboarded.user.email, 'ansar@nupurenterprise.com');

  const afterWs = await listAllWorkspaceData(db);
  assert.equal(afterWs.organization.nameBn, 'মেসার্স নূপুর এন্টারপ্রাইজ');
  assert.equal(afterWs.organization.name, 'M/S Nupur Enterprise');
  assert.equal(afterWs.organization.proprietorName, 'প্রোঃ মোঃ আনসার আহম্মদ');
  assert.equal(afterWs.organization.phone, '01711-223344');
  assert.equal(afterWs.organization.address, 'আমবাগ মধ্যপাড়া, কোনাবাড়ি, গাজীপুর');
  assert.equal(afterWs.branches.length, 1);
  assert.equal(afterWs.branches[0].code, 'KNB');
  assert.equal(afterWs.branches[0].nameBn, 'কোনাবাড়ি প্রধান শাখা');
  assert.equal(afterWs.users.length, 1);
  assert.equal((afterWs.users[0] as { name: string }).name, 'মোঃ আনসার আহম্মদ');

  await assert.rejects(
    () =>
      onboardWorkspaceTransaction(db, {
        ownerName: 'Attacker',
        ownerEmail: 'attacker@evil.com',
        passwordHash: 'pbkdf2$100000$1$2',
        orgNameBn: 'Evil Org',
        orgNameEn: 'Evil Org',
        phone: '01700000000',
        address: 'Nowhere',
      }),
    /Onboarding has already been completed/
  );
});

test('Legacy pre-seeded dummy company data is automatically wiped when onboarding_completed is 0', async () => {
  const { db } = await createMemoryTestDb();
  await seedSampleBusinessData(db, actor);

  await db.run("UPDATE organizations SET name = 'Dhaka Trade & Textiles Ltd.', onboarding_completed = 0 WHERE id = 1");
  await seedBaselineConfigAsync(db);

  const wipedWs = await listAllWorkspaceData(db);
  assert.equal(wipedWs.organization.name, '');
  assert.equal(wipedWs.users.length, 0);
  assert.equal(wipedWs.branches.length, 0);
  assert.equal(wipedWs.products.length, 0);
  assert.equal(wipedWs.invoices.length, 0);
});

test('Web Crypto PBKDF2 password hashing & handleApiRequest end-to-end onboarding + auth + invoice flow', async () => {
  const { db } = await createMemoryTestDb();
  const hash = await hashPasswordAsync('BepariPass#2026');
  assert.ok(hash.startsWith('pbkdf2$100000$'));
  assert.equal(await verifyPasswordAsync('BepariPass#2026', hash, verifyLegacyScryptPassword), true);
  assert.equal(await verifyPasswordAsync('WrongPassword', hash, verifyLegacyScryptPassword), false);

  let mutatedCount = 0;
  const opts = {
    runtimeEngine: 'on-device' as const,
    onMutate: async () => {
      mutatedCount += 1;
    },
  };

  // Runtime check
  const rtRes = await handleApiRequest(new Request('http://localhost/api/runtime'), db, opts);
  assert.equal(rtRes.status, 200);
  assert.deepEqual(await rtRes.json(), { engine: 'on-device', cloudAvailable: false });

  // Auth status shows needsOnboarding
  const stRes = await handleApiRequest(new Request('http://localhost/api/auth/status'), db, opts);
  assert.equal((await stRes.json()).needsOnboarding, true);

  // Unauthenticated workspace read must return 401
  const unauthRes = await handleApiRequest(new Request('http://localhost/api/workspace'), db, opts);
  assert.equal(unauthRes.status, 401);

  // Onboard via Web Request
  const onboardRes = await handleApiRequest(
    new Request('http://localhost/api/auth/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerName: 'তানভীর আহমেদ',
        ownerEmail: 'tanvir@bepari.bd',
        password: 'MySecurePassword1',
        orgNameBn: 'আহমেদ ট্রেডার্স',
        orgNameEn: 'Ahmed Traders',
        phone: '01711-000111',
        address: 'গুলশান-১, ঢাকা',
      }),
    }),
    db,
    opts
  );
  assert.equal(onboardRes.status, 201);
  const sess = (await onboardRes.json()) as { token: string; user: { id: number; email: string } };
  assert.ok(sess.token.length >= 32);
  assert.ok(mutatedCount >= 1);

  // Login works with PBKDF2 password
  const loginRes = await handleApiRequest(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tanvir@bepari.bd', password: 'MySecurePassword1' }),
    }),
    db,
    opts
  );
  assert.equal(loginRes.status, 200);
  const loginSess = (await loginRes.json()) as { token: string };

  // Create customer & invoice using Bearer token
  const custRes = await handleApiRequest(
    new Request('http://localhost/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginSess.token}` },
      body: JSON.stringify({ name: 'করিম এন্টারপ্রাইজ', phone: '01811-223344' }),
    }),
    db,
    opts
  );
  assert.equal(custRes.status, 201);
  const cust = (await custRes.json()) as { id: number };

  const invRes = await handleApiRequest(
    new Request('http://localhost/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginSess.token}` },
      body: JSON.stringify({
        branchId: 1,
        customerId: cust.id,
        issueDate: '2026-11-26',
        dueDate: '2026-12-06',
        items: [{ description: 'সিমেন্ট (৫০ কেজি বস্তা)', quantity: 10, unitPrice: 550, taxRuleId: 1, taxRate: 15 }],
      }),
    }),
    db,
    opts
  );
  assert.equal(invRes.status, 201);
  const inv = (await invRes.json()) as { grandTotal: number };
  assert.equal(inv.grandTotal, 6325);
});
