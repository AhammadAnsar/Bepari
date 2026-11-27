import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertJournalBalanced,
  buildReversalLines,
  generateFinancialReports,
  roundMoney,
} from './accounting';
import { calculateLineTax, formatMushakChallanNo, resolveActiveTaxRule } from './vat';
import { computeStockOutCOGS, computeWeightedAvgStockIn } from './inventory';
import {
  allocatePayment,
  buildCustomerStatement,
  computeInvoiceTotals,
  computeNextRecurringDate,
  resolveInvoiceStatus,
} from './billing';
import { formatMoney, toBanglaDigits } from './format';
import type { Account, TaxRule } from './types';

test('Double-entry accounting enforces exact Debit === Credit invariant', () => {
  const balanced = assertJournalBalanced([
    { accountCode: '1100', debit: 1150, credit: 0 },
    { accountCode: '4000', debit: 0, credit: 1000 },
    { accountCode: '2100', debit: 0, credit: 150 },
  ]);
  assert.equal(balanced.totalDebit, 1150);
  assert.equal(balanced.totalCredit, 1150);

  assert.throws(() => {
    assertJournalBalanced([
      { accountCode: '1100', debit: 1150, credit: 0 },
      { accountCode: '4000', debit: 0, credit: 1149.99 },
    ]);
  }, /Unbalanced double-entry journal/);
});

test('Immutable ledger reversal creates exact balanced contra entry', () => {
  const reversed = buildReversalLines([
    { accountCode: '1100', debit: 5000, credit: 0, memo: 'Invoice INV-001' },
    { accountCode: '4000', debit: 0, credit: 5000, memo: 'Sales' },
  ]);
  assert.equal(reversed[0].debit, 0);
  assert.equal(reversed[0].credit, 5000);
  assert.equal(reversed[1].debit, 5000);
  assert.equal(reversed[1].credit, 0);
});

test('Bangladesh VAT & Mushak calculation handles exclusive, inclusive, and SD accurately', () => {
  const excl = calculateLineTax({
    quantity: 2,
    unitPrice: 1000,
    discountAmount: 0,
    vatRate: 15,
    sdRate: 0,
    mode: 'exclusive',
  });
  assert.equal(excl.taxableValue, 2000);
  assert.equal(excl.vatAmount, 300);
  assert.equal(excl.lineTotal, 2300);

  const incl = calculateLineTax({
    quantity: 1,
    unitPrice: 1150,
    vatRate: 15,
    mode: 'inclusive',
  });
  assert.equal(incl.taxableValue, 1000);
  assert.equal(incl.vatAmount, 150);
  assert.equal(incl.lineTotal, 1150);

  const rules: TaxRule[] = [
    {
      id: 1,
      code: 'VAT-15-OLD',
      name: 'Standard VAT 15% (FY25)',
      nameBn: 'আদর্শ মূসক ১৫%',
      rate: 15,
      sdRate: 0,
      mushakCategory: 'standard',
      effectiveFrom: '2024-07-01',
      effectiveTo: '2025-06-30',
      isDefault: false,
      isActive: true,
    },
    {
      id: 2,
      code: 'VAT-15',
      name: 'Standard VAT 15%',
      nameBn: 'আদর্শ মূসক ১৫%',
      rate: 15,
      sdRate: 0,
      mushakCategory: 'standard',
      effectiveFrom: '2025-07-01',
      effectiveTo: null,
      isDefault: true,
      isActive: true,
    },
  ];
  const resolved = resolveActiveTaxRule(rules, null, '2026-11-24');
  assert.equal(resolved?.id, 2);
  assert.equal(formatMushakChallanNo('M63', 'DHK', 42, 2026), 'M63-DHK-2026-00042');
});

test('Inventory valuation calculates Weighted Average and FIFO COGS properly', () => {
  const stockIn = computeWeightedAvgStockIn(10, 100, 10, 140);
  assert.equal(stockIn.newQty, 20);
  assert.equal(stockIn.newAvgCost, 120);
  assert.equal(stockIn.newTotalValue, 2400);

  const weightedOut = computeStockOutCOGS({
    method: 'weighted_avg',
    currentQty: 20,
    currentAvgCost: 120,
    soldQty: 5,
  });
  assert.equal(weightedOut.remainingQty, 15);
  assert.equal(weightedOut.cogsTotal, 600);

  const fifoOut = computeStockOutCOGS({
    method: 'fifo',
    currentQty: 20,
    currentAvgCost: 120,
    soldQty: 12,
    fifoLots: [
      { qty: 10, unitCost: 100 },
      { qty: 10, unitCost: 140 },
    ],
  });
  assert.equal(fifoOut.cogsTotal, 1280);
  assert.equal(fifoOut.remainingLots?.[0].qty, 8);
});

test('Invoice totals, FIFO payment allocation, customer statement, and recurring date calculation', () => {
  const inv = computeInvoiceTotals([
    { productId: 1, description: 'Cotton Poplin Roll', quantity: 4, unitPrice: 1250, taxRuleId: 1, taxRate: 15 },
    { productId: 2, description: 'Tailoring Service', quantity: 1, unitPrice: 1000, taxRuleId: 2, taxRate: 7.5 },
  ]);
  assert.equal(inv.subtotal, 6000);
  assert.equal(inv.vatTotal, 825);
  assert.equal(inv.grandTotal, 6825);

  const plan = allocatePayment(4000, [
    { id: 1, invoiceNumber: 'INV-001', issueDate: '2026-10-01', balanceDue: 2500 },
    { id: 2, invoiceNumber: 'INV-002', issueDate: '2026-11-01', balanceDue: 3000 },
  ]);
  assert.equal(plan.allocations.length, 2);
  assert.equal(plan.allocations[0].amount, 2500);
  assert.equal(plan.allocations[1].amount, 1500);
  assert.equal(plan.unappliedCredit, 0);

  assert.equal(
    resolveInvoiceStatus({ grandTotal: 5000, paidAmount: 2500, dueDate: '2026-12-01', today: '2026-11-24' }),
    'partial'
  );
  assert.equal(
    resolveInvoiceStatus({ grandTotal: 5000, paidAmount: 5000, dueDate: '2026-11-01', today: '2026-11-24' }),
    'paid'
  );

  const statement = buildCustomerStatement(1000, [
    { date: '2026-11-05', type: 'invoice', reference: 'INV-101', description: 'Invoice', amount: 5000 },
    { date: '2026-11-12', type: 'payment', reference: 'PAY-101', description: 'bKash Payment', amount: 3500 },
  ]);
  assert.equal(statement.closingBalance, 2500);
  assert.equal(statement.rows[2].runningBalance, 2500);

  assert.equal(computeNextRecurringDate('2026-11-01', 'monthly'), '2026-12-01');
  assert.equal(computeNextRecurringDate('2026-11-01', 'quarterly'), '2027-02-01');
});

test('Financial reports reconcile Trial Balance, P&L, Balance Sheet, and Mushak 9.1 Net VAT', () => {
  const accounts: Account[] = [
    { id: 1, code: '1000', name: 'Cash', nameBn: 'নগদ', type: 'asset', isSystem: true },
    { id: 2, code: '1100', name: 'Accounts Receivable', nameBn: 'প্রাপ্য হিসাব', type: 'asset', isSystem: true },
    { id: 3, code: '1200', name: 'Inventory', nameBn: 'মজুদ পণ্য', type: 'asset', isSystem: true },
    { id: 4, code: '1300', name: 'Input VAT Receivable', nameBn: 'উপকরণ মূসক', type: 'asset', isSystem: true },
    { id: 5, code: '2000', name: 'Accounts Payable', nameBn: 'প্রদেয় হিসাব', type: 'liability', isSystem: true },
    { id: 6, code: '2100', name: 'Output VAT Payable', nameBn: 'প্রদেয় মূসক', type: 'liability', isSystem: true },
    { id: 7, code: '3000', name: 'Owner Capital', nameBn: 'মূলধন', type: 'equity', isSystem: true },
    { id: 8, code: '4000', name: 'Sales Revenue', nameBn: 'বিক্রয় আয়', type: 'revenue', isSystem: true },
    { id: 9, code: '5000', name: 'Cost of Goods Sold', nameBn: 'বিক্রীত পণ্যের ব্যয়', type: 'expense', isSystem: true },
  ];

  const report = generateFinancialReports(
    accounts,
    [
      // Opening capital 100,000 cash
      { accountCode: '1000', accountName: 'Cash', accountNameBn: 'নগদ', accountType: 'asset', debit: 100000, credit: 0, sourceType: 'opening' },
      { accountCode: '3000', accountName: 'Owner Capital', accountNameBn: 'মূলধন', accountType: 'equity', debit: 0, credit: 100000, sourceType: 'opening' },
      // Purchase 20,000 + 3,000 input VAT
      { accountCode: '1200', accountName: 'Inventory', accountNameBn: 'মজুদ পণ্য', accountType: 'asset', debit: 20000, credit: 0, sourceType: 'purchase' },
      { accountCode: '1300', accountName: 'Input VAT Receivable', accountNameBn: 'উপকরণ মূসক', accountType: 'asset', debit: 3000, credit: 0, sourceType: 'purchase' },
      { accountCode: '2000', accountName: 'Accounts Payable', accountNameBn: 'প্রদেয় হিসাব', accountType: 'liability', debit: 0, credit: 23000, sourceType: 'purchase' },
      // Sale 40,000 + 6,000 output VAT, COGS 15,000
      { accountCode: '1100', accountName: 'Accounts Receivable', accountNameBn: 'প্রাপ্য হিসাব', accountType: 'asset', debit: 46000, credit: 0, sourceType: 'invoice' },
      { accountCode: '4000', accountName: 'Sales Revenue', accountNameBn: 'বিক্রয় আয়', accountType: 'revenue', debit: 0, credit: 40000, sourceType: 'invoice' },
      { accountCode: '2100', accountName: 'Output VAT Payable', accountNameBn: 'প্রদেয় মূসক', accountType: 'liability', debit: 0, credit: 6000, sourceType: 'invoice' },
      { accountCode: '5000', accountName: 'Cost of Goods Sold', accountNameBn: 'বিক্রীত পণ্যের ব্যয়', accountType: 'expense', debit: 15000, credit: 0, sourceType: 'invoice' },
      { accountCode: '1200', accountName: 'Inventory', accountNameBn: 'মজুদ পণ্য', accountType: 'asset', debit: 0, credit: 15000, sourceType: 'invoice' },
    ],
    { taxableSales: 40000, taxablePurchases: 20000, sdPayable: 0, challanCount: 1 }
  );

  assert.equal(report.trialBalance.isBalanced, true);
  assert.equal(report.balanceSheet.isBalanced, true);
  assert.equal(report.profitAndLoss.netProfit, 25000);
  assert.equal(report.vatReturn.outputVat, 6000);
  assert.equal(report.vatReturn.inputVat, 3000);
  assert.equal(report.vatReturn.netVatPayable, 3000);
});

test('Bilingual South Asian currency and Bangla numeral formatting', () => {
  assert.equal(formatMoney(125450.5, 'en', '৳'), '৳1,25,450.50');
  assert.equal(formatMoney(125450.5, 'bn', '৳'), '৳১,২৫,৪৫০.৫০');
  assert.equal(toBanglaDigits('2026-11-24'), '২০২৬-১১-২৪');
  assert.equal(roundMoney(10.005), 10.01);
});
