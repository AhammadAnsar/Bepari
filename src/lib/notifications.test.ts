import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNotifications,
  computeNextMushakDeadline,
  countUnreadNotifications,
  filterNotifications,
} from './notifications';

test('computeNextMushakDeadline follows Bangladesh NBR 15th-of-next-month statutory schedule', () => {
  // Before the 15th -> deadline is 15th of current month for previous month's return
  const earlyNov = computeNextMushakDeadline(new Date(2026, 10, 10)); // 10 Nov 2026
  assert.equal(earlyNov.deadlineIso, '2026-11-15');
  assert.equal(earlyNov.daysRemaining, 5);
  assert.equal(earlyNov.taxPeriodEn, 'October 2026');

  // After the 15th -> deadline is 15th of next month for current month's return
  const lateNov = computeNextMushakDeadline(new Date(2026, 10, 25)); // 25 Nov 2026
  assert.equal(lateNov.deadlineIso, '2026-12-15');
  assert.equal(lateNov.daysRemaining, 20);
  assert.equal(lateNov.taxPeriodEn, 'November 2026');

  // Year rollover in late December -> 15 January next year
  const lateDec = computeNextMushakDeadline(new Date(2026, 11, 20)); // 20 Dec 2026
  assert.equal(lateDec.deadlineIso, '2027-01-15');
  assert.equal(lateDec.taxPeriodEn, 'December 2026');
});

test('buildNotifications generates low inventory, pending/overdue payment, and Mushak alerts sorted by severity', () => {
  const notifications = buildNotifications(
    {
      organization: {
        id: 1,
        name: 'Dhaka Trade',
        nameBn: 'ঢাকা ট্রেড',
        binNumber: '001948271-0101',
        tinNumber: '123456',
        phone: '+8801711',
        email: 'a@b.com',
        address: 'Dhaka',
        currency: 'BDT',
        currencySymbol: '৳',
        defaultLanguage: 'en',
        vatMode: 'exclusive',
        inventoryMethod: 'weighted_avg',
        invoicePrefix: 'INV',
        mushakPrefix: 'M63',
        fiscalYearStartMonth: 7,
        adminLockEnabled: false,
      },
      products: [
        {
          id: 1,
          sku: 'THR-01',
          name: 'Industrial Thread',
          nameBn: 'ইন্ডাস্ট্রিয়াল সুতা',
          unit: 'pack',
          category: 'Raw',
          hsCode: '5401',
          trackInventory: true,
          salePrice: 500,
          costPrice: 300,
          taxRuleId: 1,
          reorderLevel: 10,
          stockQty: 4,
          stockValue: 1200,
        },
        {
          id: 2,
          sku: 'OK-02',
          name: 'Healthy Stock Item',
          nameBn: 'পর্যাপ্ত স্টক',
          unit: 'pcs',
          category: 'Goods',
          hsCode: '5208',
          trackInventory: true,
          salePrice: 1000,
          costPrice: 700,
          taxRuleId: 1,
          reorderLevel: 5,
          stockQty: 50,
          stockValue: 35000,
        },
      ],
      invoices: [
        {
          id: 10,
          invoiceNumber: 'INV-00010',
          mushakChallanNo: 'M63-00010',
          branchId: 1,
          branchName: 'Dhaka',
          customerId: 1,
          customerName: 'Kamrul Hasan',
          customerBin: '',
          issueDate: '2026-11-01',
          dueDate: '2026-11-18',
          status: 'overdue',
          source: 'invoice',
          subtotal: 10000,
          discountTotal: 0,
          vatTotal: 1500,
          sdTotal: 0,
          grandTotal: 11500,
          paidAmount: 0,
          balanceDue: 11500,
          journalEntryId: 1,
          notes: '',
          createdAt: '2026-11-01',
          items: [],
        },
        {
          id: 11,
          invoiceNumber: 'INV-00011',
          mushakChallanNo: 'M63-00011',
          branchId: 1,
          branchName: 'Dhaka',
          customerId: 2,
          customerName: 'Sajjad Hossain',
          customerBin: '',
          issueDate: '2026-11-24',
          dueDate: '2026-11-30',
          status: 'sent',
          source: 'invoice',
          subtotal: 5000,
          discountTotal: 0,
          vatTotal: 750,
          sdTotal: 0,
          grandTotal: 5750,
          paidAmount: 0,
          balanceDue: 5750,
          journalEntryId: 2,
          notes: '',
          createdAt: '2026-11-24',
          items: [],
        },
      ],
      reports: {
        profitAndLoss: { revenue: [], expenses: [], totalRevenue: 0, totalExpenses: 0, grossProfit: 0, netProfit: 0 },
        balanceSheet: { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilities: 0, retainedEarnings: 0, totalEquity: 0, isBalanced: true },
        cashFlow: { operatingInflows: 0, operatingOutflows: 0, netCashFlow: 0, endingCashBalance: 0 },
        trialBalance: { rows: [], totalDebit: 0, totalCredit: 0, isBalanced: true },
        vatReturn: {
          outputVat: 20000,
          inputVat: 5000,
          sdPayable: 0,
          netVatPayable: 15000,
          taxableSales: 133333,
          taxablePurchases: 33333,
          challanCount: 6,
        },
      },
    },
    new Date(2026, 10, 25), // 25 Nov 2026
  );

  // Expect 1 Mushak + 1 Low Stock + 2 Unpaid Invoices = 4 alerts
  assert.equal(notifications.length, 4);
  // Critical overdue invoice should come first
  assert.equal(notifications[0].severity, 'critical');
  assert.equal(notifications[0].category, 'payment');

  const invOnly = filterNotifications(notifications, 'inventory', new Set());
  assert.equal(invOnly.length, 1);
  assert.equal(invOnly[0].product?.sku, 'THR-01');

  const mushakOnly = filterNotifications(notifications, 'mushak', new Set());
  assert.equal(mushakOnly.length, 1);
  assert.ok(mushakOnly[0].titleEn.includes('November 2026'));

  const readIds = new Set([notifications[0].id]);
  const dismissedIds = new Set([notifications[1].id]);
  assert.equal(countUnreadNotifications(notifications, readIds, dismissedIds), 2);
});
