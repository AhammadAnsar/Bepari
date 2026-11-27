import test from 'node:test';
import assert from 'node:assert/strict';
import {
  amountToWords,
  buildEmptyStructuralInvoice,
  CASH_MEMO_TEMPLATE_IDS,
  computeCashMemoFigures,
  renderCashMemoHtml,
  renderThermalReceiptHtml,
  resolveCashMemoConfig,
  sanitizeCashMemoSettings,
} from './cashMemoTemplates';
import type { Invoice, Organization } from '../engine/types';

const mockOrg: Organization = {
  id: 1,
  name: 'Dhaka Trade & Textiles Ltd.',
  nameBn: 'ঢাকা ট্রেড অ্যান্ড টেক্সটাইলস লিমিটেড',
  binNumber: '001948271-0101',
  tinNumber: '548291038472',
  phone: '+880 1711-004821',
  email: 'accounts@dhakatrade.com.bd',
  address: 'House 42, Road 11, Gulshan-1, Dhaka',
  currency: 'BDT',
  currencySymbol: '৳',
  defaultLanguage: 'bn',
  inventoryMethod: 'weighted_avg',
  vatMode: 'exclusive',
  fiscalYearStartMonth: 7,
  invoicePrefix: 'INV',
  mushakPrefix: 'M63',
};

const mockInvoice: Invoice = {
  id: 4,
  invoiceNumber: 'INV-DHK-2026-00004',
  mushakChallanNo: 'M63-DHK-2026-00004',
  branchId: 1,
  branchName: 'Dhaka Gulshan Main',
  customerId: 1,
  customerName: 'Walk-in Counter <script>alert(1)</script>',
  customerAddress: 'Gulshan-1, Dhaka',
  customerPhone: '+8801711000000',
  issueDate: '2026-11-26',
  dueDate: '2026-11-26',
  status: 'paid',
  source: 'pos',
  subtotal: 5000,
  discountTotal: 0,
  vatTotal: 750,
  sdTotal: 0,
  grandTotal: 5750,
  paidAmount: 5750,
  balanceDue: 0,
  journalEntryId: 10,
  notes: '',
  createdAt: '2026-11-26T10:00:00Z',
  items: [
    {
      productId: 1,
      description: 'Combed Cotton Poplin',
      quantity: 1,
      unitPrice: 5000,
      discountAmount: 0,
      taxRuleId: 1,
      taxRate: 15,
      sdRate: 0,
      taxableValue: 5000,
      vatAmount: 750,
      sdAmount: 0,
      lineTotal: 5750,
    },
  ],
};

test('amountToWords converts BDT figures into English and Bengali South Asian words', () => {
  assert.equal(amountToWords(5750, 'en'), 'Five Thousand Seven Hundred Fifty Taka Only');
  assert.equal(amountToWords(125000, 'en'), 'One Lakh Twenty Five Thousand Taka Only');
  assert.equal(amountToWords(5750, 'bn'), 'পাঁচ হাজার সাত শত পঞ্চাশ টাকা মাত্র');
  assert.equal(amountToWords(0, 'bn'), 'শূন্য টাকা মাত্র');
});

test('sanitizeCashMemoSettings isolates per-template overrides and validates colors/bounds', () => {
  const clean = sanitizeCashMemoSettings({
    activeTemplateId: 'bengali-classic',
    thermalPaperWidth: '58mm',
    templates: {
      'bengali-classic': {
        businessName: 'মেসার্স বাংলা ট্রেডার্স',
        primaryColor: '#123456',
        minRows: 99,
        defaultIncludeVat: false,
      },
      'navy-amber': {
        slogan: 'Custom Navy Slogan',
        primaryColor: 'javascript:alert(1)',
      },
    },
  });

  assert.equal(clean.activeTemplateId, 'bengali-classic');
  assert.equal(clean.thermalPaperWidth, '58mm');
  assert.equal(clean.templates['bengali-classic']?.businessName, 'মেসার্স বাংলা ট্রেডার্স');
  assert.equal(clean.templates['bengali-classic']?.minRows, 14);
  // Invalid hex falls back safely to template default
  assert.equal(clean.templates['navy-amber']?.primaryColor, '#0B3B54');
  // Per-template independence: bengali-classic custom businessName does not leak to navy-amber
  const navyResolved = resolveCashMemoConfig(clean, 'navy-amber', mockOrg, 'en');
  assert.equal(navyResolved.config.slogan, 'Custom Navy Slogan');
  assert.equal(navyResolved.config.businessName, mockOrg.name);
});

test('computeCashMemoFigures toggles VAT/Mushak cleanly between With-Mushak and Without-Mushak', () => {
  const withVat = computeCashMemoFigures(mockInvoice, true);
  assert.equal(withVat.subtotal, 5000);
  assert.equal(withVat.vatTotal, 750);
  assert.equal(withVat.payableTotal, 5750);
  assert.equal(withVat.items[0].amount, 5750);

  const withoutVat = computeCashMemoFigures(mockInvoice, false);
  assert.equal(withoutVat.subtotal, 5000);
  assert.equal(withoutVat.vatTotal, 0);
  assert.equal(withoutVat.payableTotal, 5000);
  assert.equal(withoutVat.items[0].amount, 5000);
});

test('All 7 Cash Memo templates render escaped HTML and respect includeVat toggle', () => {
  for (const id of CASH_MEMO_TEMPLATE_IDS) {
    const htmlWithVat = renderCashMemoHtml(mockInvoice, mockOrg, 'bn', { templateId: id, includeVat: true });
    assert.ok(htmlWithVat.includes('INV-DHK-2026-00004'), `${id} missing invoice number`);
    assert.ok(htmlWithVat.includes('001948271-0101'), `${id} missing BIN when includeVat=true`);
    assert.ok(!htmlWithVat.includes('<script>alert(1)</script>'), `${id} failed XSS escaping`);

    const htmlWithoutVat = renderCashMemoHtml(mockInvoice, mockOrg, 'bn', { templateId: id, includeVat: false });
    assert.ok(!htmlWithoutVat.includes('001948271-0101'), `${id} leaked BIN when includeVat=false`);
    assert.ok(!htmlWithoutVat.includes('M63-DHK-2026-00004'), `${id} leaked Mushak 6.3 when includeVat=false`);
  }
});

test('renderThermalReceiptHtml generates valid 80mm/58mm printable terminal markup', () => {
  const withVat = renderThermalReceiptHtml(mockInvoice, mockOrg, 'bn', { includeVat: true, paperWidth: '80mm' });
  assert.ok(withVat.includes('@page { size: 80mm auto;'));
  assert.ok(withVat.includes('001948271-0101'));
  assert.ok(!withVat.includes('<script>alert(1)</script>'));

  const noVat = renderThermalReceiptHtml(mockInvoice, mockOrg, 'en', { includeVat: false, paperWidth: '58mm' });
  assert.ok(noVat.includes('@page { size: 58mm auto;'));
  assert.ok(!noVat.includes('001948271-0101'));
  assert.ok(noVat.includes('Cash Memo (No VAT)'));
});

test('Per-template font families and pixel sizes sanitize safely and render across all 7 templates', () => {
  const sanitized = sanitizeCashMemoSettings({
    activeTemplateId: 'navy-amber',
    templates: {
      'navy-amber': {
        headerFontFamily: 'tiro-bangla',
        headerTitleSize: 99, // clamps to 36
        headerMetaSize: 4, // clamps to 9
        bodyFontFamily: 'hind-siliguri',
        bodyFontSize: 15,
        tableFontFamily: 'ibm-mono',
        tableHeaderSize: 14,
        tableCellSize: 13,
        footerFontFamily: 'noto-serif',
        footerFontSize: 14,
      },
      'crimson-black': {
        headerFontFamily: 'invalid-font-name' as unknown as 'noto-sans',
        headerTitleSize: 10, // clamps to 16
      },
    },
  });

  const navy = sanitized.templates['navy-amber']!;
  assert.equal(navy.headerFontFamily, 'tiro-bangla');
  assert.equal(navy.headerTitleSize, 36);
  assert.equal(navy.headerMetaSize, 9);
  assert.equal(navy.bodyFontFamily, 'hind-siliguri');
  assert.equal(navy.bodyFontSize, 15);
  assert.equal(navy.tableFontFamily, 'ibm-mono');
  assert.equal(navy.tableHeaderSize, 14);
  assert.equal(navy.tableCellSize, 13);
  assert.equal(navy.footerFontFamily, 'noto-serif');
  assert.equal(navy.footerFontSize, 14);

  const crimson = sanitized.templates['crimson-black']!;
  assert.equal(crimson.headerFontFamily, undefined);
  assert.equal(crimson.headerTitleSize, 16);

  // Verify every single one of the 7 templates applies custom fonts & exact px sizes in rendered HTML
  for (const id of CASH_MEMO_TEMPLATE_IDS) {
    const customSettings = sanitizeCashMemoSettings({
      activeTemplateId: id,
      templates: {
        [id]: {
          headerFontFamily: 'tiro-bangla',
          headerTitleSize: 33,
          headerMetaSize: 14,
          bodyFontFamily: 'hind-siliguri',
          bodyFontSize: 15,
          tableFontFamily: 'ibm-mono',
          tableHeaderSize: 14,
          tableCellSize: 13,
          footerFontFamily: 'baloo-da',
          footerFontSize: 15,
        },
      },
    });
    const html = renderCashMemoHtml(mockInvoice, mockOrg, 'bn', {
      templateId: id,
      settings: customSettings,
      includeVat: true,
    });
    assert.ok(html.includes("'Tiro Bangla'"), `${id} missing header font`);
    assert.ok(html.includes('font-size:33px'), `${id} missing headerTitleSize 33px`);
    assert.ok(html.includes('font-size:14px'), `${id} missing headerMetaSize/tableHeaderSize 14px`);
    assert.ok(html.includes("'Hind Siliguri'"), `${id} missing body font`);
    assert.ok(html.includes('font-size:15px'), `${id} missing bodyFontSize/footerFontSize 15px`);
    assert.ok(html.includes("'IBM Plex Mono'"), `${id} missing table font`);
    assert.ok(html.includes('font-size:13px'), `${id} missing tableCellSize 13px`);
    assert.ok(html.includes("'Baloo Da 2'"), `${id} missing footer font`);
  }
});

test('Zero dummy defaults across all 7 templates and DB-first organization auto-sync', () => {
  // With empty org profile fields and no overrides, no hardcoded dummy strings leak
  for (const id of CASH_MEMO_TEMPLATE_IDS) {
    const resolved = resolveCashMemoConfig(undefined, id, mockOrg, 'bn');
    assert.equal(resolved.config.slogan, '', `${id} leaked dummy slogan`);
    assert.equal(resolved.config.proprietorLabel, '', `${id} leaked dummy proprietorLabel`);
    assert.equal(resolved.config.businessDescription, '', `${id} leaked dummy businessDescription`);
    assert.equal(resolved.config.website, '', `${id} leaked dummy website`);
  }

  // When org DB has proprietorName/tagline/website/businessDescription, DB values win automatically across all templates
  const syncedOrg: Organization = {
    ...mockOrg,
    proprietorName: 'প্রোঃ মোঃ আরিফুল ইসলাম',
    tagline: 'বিশ্বস্ত টেক্সটাইল ও হোলসেল সরবরাহ',
    website: 'www.dhakatrade.com.bd',
    businessDescription: 'সকল প্রকার কটন, লিনেন ও গার্মেন্টস এক্সেসরিজ পাইকারি বিক্রয়।',
  };
  for (const id of CASH_MEMO_TEMPLATE_IDS) {
    const resolved = resolveCashMemoConfig(
      sanitizeCashMemoSettings({
        activeTemplateId: id,
        templates: { [id]: { slogan: 'Old Stale Override' } },
      }),
      id,
      syncedOrg,
      'bn'
    );
    assert.equal(resolved.config.slogan, syncedOrg.tagline, `${id} did not prefer live DB tagline`);
    assert.equal(resolved.config.proprietorLabel, syncedOrg.proprietorName);
    assert.equal(resolved.config.website, syncedOrg.website);
    assert.equal(resolved.config.businessDescription, syncedOrg.businessDescription);

    const html = renderCashMemoHtml(mockInvoice, syncedOrg, 'bn', { templateId: id, includeVat: true });
    assert.ok(html.includes(syncedOrg.nameBn), `${id} missing live DB org name`);
  }
});

test('buildEmptyStructuralInvoice renders clean blank structural Cash Memo with zero dummy data', () => {
  const emptyInv = buildEmptyStructuralInvoice(mockOrg, undefined, 'bn');
  assert.equal(emptyInv.id, 0);
  assert.equal((emptyInv.items ?? []).length, 0);
  assert.equal(emptyInv.customerName, '');
  assert.equal(emptyInv.invoiceNumber, `${mockOrg.invoicePrefix}-`);

  for (const id of CASH_MEMO_TEMPLATE_IDS) {
    const html = renderCashMemoHtml(emptyInv, mockOrg, 'bn', { templateId: id, includeVat: true });
    assert.ok(html.includes(mockOrg.nameBn), `${id} missing real org name on empty structural memo`);
    assert.ok(!html.includes('Zero Taka Only'), `${id} rendered dummy zero-taka words on empty memo`);
    assert.ok(!html.includes('শূন্য টাকা মাত্র'), `${id} rendered dummy Bengali zero-taka words on empty memo`);
    assert.ok(!html.includes('৳০.০০'), `${id} rendered dummy 0 amount on empty memo`);
    assert.ok(!html.includes('www.bepari-store.com.bd'), `${id} leaked old dummy website`);
  }
});
