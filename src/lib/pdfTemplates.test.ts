import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdfTemplate, escapeHtml } from './pdfTemplates';
import type { FinancialReportSummary, Invoice, Organization } from '../engine/types';

const mockOrg: Organization = {
  id: 1,
  name: 'Dhaka Trade & Textiles Ltd.',
  nameBn: 'ঢাকা ট্রেড অ্যান্ড টেক্সটাইলস লিমিটেড',
  binNumber: '001948271-0101',
  tinNumber: '592847163012',
  phone: '+880 1711-000000',
  email: 'accounts@dhakatrade.com.bd',
  address: 'House 14, Road 9, Gulshan-1, Dhaka',
  currency: 'BDT',
  currencySymbol: '৳',
  defaultLanguage: 'bn',
  vatMode: 'exclusive',
  inventoryMethod: 'weighted_avg',
  invoicePrefix: 'INV',
  mushakPrefix: 'M63',
  fiscalYearStartMonth: 7,
  adminLockEnabled: false,
};

const mockInvoice: Invoice = {
  id: 1,
  invoiceNumber: 'INV-DHK-2026-00001',
  mushakChallanNo: 'M63-DHK-2026-00001',
  branchId: 1,
  branchName: 'Dhaka Head Office',
  customerId: 1,
  customerName: 'Kamrul <script>alert(1)</script> Hasan',
  customerBin: '002211445-0101',
  issueDate: '2026-11-08',
  dueDate: '2026-11-18',
  status: 'partial',
  source: 'invoice',
  subtotal: 10000,
  discountTotal: 0,
  vatTotal: 1500,
  sdTotal: 0,
  grandTotal: 11500,
  paidAmount: 5000,
  balanceDue: 6500,
  journalEntryId: null,
  notes: 'Net 10 days',
  createdAt: '2026-11-08T10:00:00Z',
  items: [
    {
      productId: 1,
      description: 'Premium Cotton Fabric Roll',
      quantity: 2,
      unitPrice: 5000,
      discountAmount: 0,
      taxRuleId: 1,
      taxRate: 15,
      sdRate: 0,
      taxableValue: 10000,
      vatAmount: 1500,
      sdAmount: 0,
      lineTotal: 11500,
    },
  ],
};

const mockReports: FinancialReportSummary = {
  profitAndLoss: {
    revenue: [{ code: '4000', name: 'Sales Revenue', nameBn: 'বিক্রয় আয়', amount: 100000 }],
    expenses: [{ code: '5000', name: 'Cost of Goods Sold', nameBn: 'বিক্রীত পণ্যের খরচ', amount: 60000 }],
    totalRevenue: 100000,
    totalExpenses: 60000,
    grossProfit: 40000,
    netProfit: 40000,
  },
  balanceSheet: {
    assets: [{ code: '1010', name: 'Cash in Hand', nameBn: 'নগদ তহবিল', amount: 140000 }],
    liabilities: [{ code: '2100', name: 'Output VAT Payable', nameBn: 'আউটপুট মূসক প্রদেয়', amount: 15000 }],
    equity: [{ code: '3000', name: 'Owner Equity', nameBn: 'মালিকানা মূলধন', amount: 85000 }],
    totalAssets: 140000,
    totalLiabilities: 15000,
    retainedEarnings: 40000,
    totalEquity: 125000,
    isBalanced: true,
  },
  cashFlow: {
    operatingInflows: 150000,
    operatingOutflows: 10000,
    netCashFlow: 140000,
    endingCashBalance: 140000,
  },
  trialBalance: {
    rows: [
      { accountCode: '1010', accountName: 'Cash', accountNameBn: 'নগদ', accountType: 'asset', debit: 140000, credit: 0, netBalance: 140000 },
      { accountCode: '4000', accountName: 'Sales', accountNameBn: 'বিক্রয়', accountType: 'revenue', debit: 0, credit: 140000, netBalance: -140000 },
    ],
    totalDebit: 140000,
    totalCredit: 140000,
    isBalanced: true,
  },
  vatReturn: {
    outputVat: 15000,
    inputVat: 5000,
    sdPayable: 0,
    netVatPayable: 10000,
    taxableSales: 100000,
    taxablePurchases: 33333.33,
    challanCount: 4,
  },
};

test('escapeHtml neutralizes HTML injection characters', () => {
  assert.equal(escapeHtml('<script>"test"</script>'), '&lt;script&gt;&quot;test&quot;&lt;/script&gt;');
});

test('buildPdfTemplate generates escaped Bangla Invoice & Mushak 6.3 PDFs', () => {
  const invPdf = buildPdfTemplate({ type: 'invoice', invoice: mockInvoice }, mockOrg, 'bn');
  assert.equal(invPdf.filename, 'INV-DHK-2026-00001.pdf');
  assert.equal(invPdf.pageFormat, 'a4');
  assert.ok(invPdf.html.includes('ঢাকা ট্রেড অ্যান্ড টেক্সটাইলস লিমিটেড'));
  assert.ok(invPdf.html.includes('001948271-0101'));
  assert.ok(!invPdf.html.includes('<script>alert(1)</script>'));
  assert.ok(invPdf.html.includes('&lt;script&gt;'));

  const m63Pdf = buildPdfTemplate({ type: 'mushak_63', invoice: mockInvoice }, mockOrg, 'bn');
  assert.equal(m63Pdf.filename, 'M63-DHK-2026-00001.pdf');
  assert.ok(m63Pdf.html.includes('কর চালানপত্র · মূসক-৬.৩'));
});

test('buildPdfTemplate generates all financial and VAT return PDF templates', () => {
  const pnl = buildPdfTemplate({ type: 'pnl', reports: mockReports }, mockOrg, 'bn');
  assert.ok(pnl.filename.startsWith('Profit-and-Loss-'));
  assert.ok(pnl.html.includes('লাভ-ক্ষতি বিবরণী'));

  const bs = buildPdfTemplate({ type: 'balance_sheet', reports: mockReports }, mockOrg, 'en');
  assert.ok(bs.filename.startsWith('Balance-Sheet-'));
  assert.ok(bs.html.includes('BALANCE SHEET'));

  const cf = buildPdfTemplate({ type: 'cash_flow', reports: mockReports }, mockOrg, 'bn');
  assert.ok(cf.filename.startsWith('Cash-Flow-'));

  const tb = buildPdfTemplate({ type: 'trial_balance', reports: mockReports }, mockOrg, 'bn');
  assert.ok(tb.filename.startsWith('Trial-Balance-'));

  const m91 = buildPdfTemplate({ type: 'mushak_91', reports: mockReports }, mockOrg, 'bn');
  assert.ok(m91.filename.startsWith('Mushak-9.1-Return-'));
  assert.ok(m91.html.includes('Part 7 · Net'));

  const posVat = buildPdfTemplate({ type: 'pos_receipt', invoice: mockInvoice, includeVat: true }, mockOrg, 'bn');
  assert.equal(posVat.pageFormat, 'a4');
  assert.equal(posVat.widthPx, 760);
  assert.ok(posVat.filename.endsWith('-mushak.pdf'));
  assert.ok(posVat.html.includes('001948271-0101'));

  const posNoVat = buildPdfTemplate({ type: 'pos_receipt', invoice: mockInvoice, includeVat: false }, mockOrg, 'bn');
  assert.equal(posNoVat.pageFormat, 'a4');
  assert.ok(posNoVat.filename.endsWith('-no-mushak.pdf'));
  assert.ok(!posNoVat.html.includes('001948271-0101'));

  const sampleProduct = {
    id: 1,
    sku: 'TEX-101',
    barcode: '8941101001012',
    name: 'Combed Cotton <script>x</script>',
    nameBn: 'কম্বড কটন পপলিন',
    category: 'Textiles',
    brand: 'Bengal Loom',
    unit: 'roll',
    hsCode: '5208.21',
    salePrice: 6800,
    costPrice: 5100,
    taxRuleId: 1,
    taxRate: 15,
    trackInventory: true,
    reorderLevel: 10,
    stockQty: 18,
    stockValue: 91800,
  };

  const catalog = buildPdfTemplate({ type: 'product_catalog', products: [sampleProduct] }, mockOrg, 'bn');
  assert.ok(catalog.filename.startsWith('Product-Catalog-'));
  assert.ok(catalog.html.includes('প্রোডাক্ট ডাইরেক্টরি'));
  assert.ok(catalog.html.includes('TEX-101'));
  assert.ok(!catalog.html.includes('<script>x</script>'));

  const labels = buildPdfTemplate({ type: 'barcode_labels', items: [{ product: sampleProduct, copies: 2 }] }, mockOrg, 'en');
  assert.ok(labels.filename.startsWith('Barcode-Labels-'));
  assert.ok(labels.html.includes('<svg '));
  assert.ok(labels.html.includes('8941101001012'));
  assert.ok(!labels.html.includes('<script>x</script>'));
});

test('buildPdfTemplate uses organization initials monogram by default and embeds custom organization logoUrl', () => {
  const defaultPdf = buildPdfTemplate({ type: 'pnl', reports: mockReports }, mockOrg, 'bn');
  assert.ok(defaultPdf.html.includes('>DT<'));
  assert.ok(defaultPdf.html.includes('বেপারি'));

  const customOrg: Organization = {
    ...mockOrg,
    logoUrl: 'data:image/png;base64,iVBORw0KGgo=',
  };
  const customPdf = buildPdfTemplate({ type: 'pnl', reports: mockReports }, customOrg, 'en');
  assert.ok(customPdf.html.includes('data:image/png;base64,iVBORw0KGgo='));
  assert.ok(customPdf.html.includes('<img src='));
});

