import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWorkspace, type SearchableWorkspace } from './globalSearch';

const fixture: SearchableWorkspace = {
  invoices: [
    {
      id: 12,
      invoiceNumber: 'INV-DHK-2026-00012',
      mushakChallanNo: 'M63-DHK-2026-00012',
      branchId: 1,
      branchName: 'Dhaka Main',
      customerId: 1,
      customerName: 'Kamrul Hasan',
      customerBin: '002847192-0102',
      issueDate: '2026-11-24',
      dueDate: '2026-12-04',
      status: 'sent',
      source: 'invoice',
      subtotal: 18000,
      discountTotal: 0,
      vatTotal: 2700,
      sdTotal: 0,
      grandTotal: 20700,
      paidAmount: 0,
      balanceDue: 20700,
      journalEntryId: 1,
      notes: 'Monthly retainer',
      createdAt: '2026-11-24T00:00:00Z',
      items: [],
    },
  ],
  products: [
    {
      id: 7,
      sku: 'FAB-COT-44',
      name: 'Premium Cotton Fabric Roll',
      nameBn: 'প্রিমিয়াম কটন ফেব্রিক রোল',
      unit: 'roll',
      category: 'Textiles',
      hsCode: '5208.11',
      salePrice: 5200,
      costPrice: 3400,
      taxRuleId: 1,
      reorderLevel: 5,
      trackInventory: true,
      stockQty: 18,
      stockValue: 61200,
    },
  ],
  customers: [
    {
      id: 3,
      code: 'CUS-003',
      name: 'Sajjad Hossain',
      companyName: 'Karnaphuli Builders & Supply',
      phone: '+8801711002233',
      email: 'sajjad@karnaphuli.com.bd',
      address: 'Agrabad, Chattogram',
      binNumber: '003948112-0501',
      creditLimit: 500000,
      openingBalance: 0,
      receivableBalance: 23460,
      createdAt: '2026-11-01T00:00:00Z',
    },
  ],
};

test('searchWorkspace returns empty results for blank query', () => {
  const res = searchWorkspace(fixture, '   ');
  assert.equal(res.totalCount, 0);
  assert.equal(res.flat.length, 0);
});

test('searchWorkspace finds invoices by invoice number, Mushak number, customer, and numeric ID', () => {
  assert.equal(searchWorkspace(fixture, 'INV-DHK-2026-00012').invoices.length, 1);
  assert.equal(searchWorkspace(fixture, 'M63-DHK-2026-00012').invoices.length, 1);
  assert.equal(searchWorkspace(fixture, 'Kamrul').invoices.length, 1);
  assert.equal(searchWorkspace(fixture, '#12').invoices.length, 1);
});

test('searchWorkspace finds products by English name, Bangla name, SKU, and numeric ID', () => {
  assert.equal(searchWorkspace(fixture, 'Cotton Fabric').products.length, 1);
  assert.equal(searchWorkspace(fixture, 'কটন ফেব্রিক').products.length, 1);
  assert.equal(searchWorkspace(fixture, 'FAB-COT').products.length, 1);
  assert.equal(searchWorkspace(fixture, '7').products.length, 1);
});

test('searchWorkspace finds customers by name, company, phone, BIN, and numeric ID', () => {
  assert.equal(searchWorkspace(fixture, 'Sajjad').customers.length, 1);
  assert.equal(searchWorkspace(fixture, 'Karnaphuli').customers.length, 1);
  assert.equal(searchWorkspace(fixture, '003948112').customers.length, 1);
  assert.equal(searchWorkspace(fixture, '#3').customers.length, 1);
});
