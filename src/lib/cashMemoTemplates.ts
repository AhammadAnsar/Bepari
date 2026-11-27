import { formatDate, formatMoney, formatNumber } from '../engine/format';
import type { Invoice, Language, Organization } from '../engine/types';

export type CashMemoTemplateId =
  | 'navy-amber'
  | 'crimson-black'
  | 'charcoal-gold'
  | 'bengali-classic'
  | 'ocean-corporate'
  | 'sunset-ember'
  | 'heritage-enterprise';

export type CashMemoFontScale = 'compact' | 'standard' | 'comfortable';
export type ThermalPaperWidth = '80mm' | '58mm';

export type CashMemoFontId =
  | 'noto-sans'
  | 'hind-siliguri'
  | 'tiro-bangla'
  | 'noto-serif'
  | 'baloo-da'
  | 'ibm-plex'
  | 'ibm-mono';

export interface CashMemoFontMeta {
  id: CashMemoFontId;
  labelBn: string;
  labelEn: string;
  css: string;
}

export const CASH_MEMO_FONT_IDS: CashMemoFontId[] = [
  'noto-sans',
  'hind-siliguri',
  'tiro-bangla',
  'noto-serif',
  'baloo-da',
  'ibm-plex',
  'ibm-mono',
];

export const CASH_MEMO_FONTS: Record<CashMemoFontId, CashMemoFontMeta> = {
  'noto-sans': {
    id: 'noto-sans',
    labelBn: 'নোটো স্যান্স বাংলা (স্ট্যান্ডার্ড)',
    labelEn: 'Noto Sans Bengali (Standard)',
    css: "'Noto Sans Bengali', 'IBM Plex Sans', sans-serif",
  },
  'hind-siliguri': {
    id: 'hind-siliguri',
    labelBn: 'হিন্দ শিলিগুড়ি (আধুনিক বাংলা)',
    labelEn: 'Hind Siliguri (Modern Bangla)',
    css: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif",
  },
  'tiro-bangla': {
    id: 'tiro-bangla',
    labelBn: 'তিরো বাংলা (ঐতিহ্যবাহী সেরিফ)',
    labelEn: 'Tiro Bangla (Classic Serif)',
    css: "'Tiro Bangla', 'Noto Serif Bengali', serif",
  },
  'noto-serif': {
    id: 'noto-serif',
    labelBn: 'নোটো সেরিফ বাংলা (আনুষ্ঠানিক)',
    labelEn: 'Noto Serif Bengali (Formal Serif)',
    css: "'Noto Serif Bengali', 'Tiro Bangla', serif",
  },
  'baloo-da': {
    id: 'baloo-da',
    labelBn: 'বালু দা ২ (বোল্ড ডিসপ্লে)',
    labelEn: 'Baloo Da 2 (Bold Display)',
    css: "'Baloo Da 2', 'Noto Sans Bengali', sans-serif",
  },
  'ibm-plex': {
    id: 'ibm-plex',
    labelBn: 'IBM Plex Sans (কর্পোরেট)',
    labelEn: 'IBM Plex Sans (Corporate)',
    css: "'IBM Plex Sans', 'Noto Sans Bengali', sans-serif",
  },
  'ibm-mono': {
    id: 'ibm-mono',
    labelBn: 'IBM Plex Mono (লেজার মনো)',
    labelEn: 'IBM Plex Mono (Ledger Mono)',
    css: "'IBM Plex Mono', 'Noto Sans Bengali', monospace",
  },
};

export const CASH_MEMO_FONT_SIZE_BOUNDS = {
  headerTitleSize: { min: 16, max: 36 },
  headerMetaSize: { min: 9, max: 16 },
  bodyFontSize: { min: 9, max: 16 },
  tableHeaderSize: { min: 9, max: 16 },
  tableCellSize: { min: 9, max: 16 },
  footerFontSize: { min: 9, max: 16 },
} as const;

export interface CashMemoTemplateCustomization {
  showInvocation: boolean;
  invocationText: string;
  memoTitle: string;
  businessName: string;
  slogan: string;
  proprietorLabel: string;
  businessDescription: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  showLogo: boolean;
  showWatermark: boolean;
  primaryColor: string;
  accentColor: string;
  tableHeaderColor: string;
  paperTint: string;
  fontScale: CashMemoFontScale;
  headerFontFamily: CashMemoFontId;
  headerTitleSize: number;
  headerMetaSize: number;
  bodyFontFamily: CashMemoFontId;
  bodyFontSize: number;
  tableFontFamily: CashMemoFontId;
  tableHeaderSize: number;
  tableCellSize: number;
  footerFontFamily: CashMemoFontId;
  footerFontSize: number;
  minRows: number;
  defaultIncludeVat: boolean;
  showBinNumber: boolean;
  showMushakRef: boolean;
  showPaymentMethod: boolean;
  showAmountInWords: boolean;
  showAdvanceAndDue: boolean;
  colSl: string;
  colDesc: string;
  colQty: string;
  colRate: string;
  colAmount: string;
  footerNote: string;
  customerSignLabel: string;
  authorizedSignLabel: string;
}

export interface CashMemoSettings {
  activeTemplateId: CashMemoTemplateId;
  thermalPaperWidth: ThermalPaperWidth;
  templates: Partial<Record<CashMemoTemplateId, Partial<CashMemoTemplateCustomization>>>;
}

export interface CashMemoTemplateMeta {
  id: CashMemoTemplateId;
  nameEn: string;
  nameBn: string;
  subtitleEn: string;
  subtitleBn: string;
  previewPrimary: string;
  previewAccent: string;
  defaults: CashMemoTemplateCustomization;
}

export const CASH_MEMO_TEMPLATE_IDS: CashMemoTemplateId[] = [
  'navy-amber',
  'crimson-black',
  'charcoal-gold',
  'bengali-classic',
  'ocean-corporate',
  'sunset-ember',
  'heritage-enterprise',
];

export const CASH_MEMO_TEMPLATES: Record<CashMemoTemplateId, CashMemoTemplateMeta> = {
  'navy-amber': {
    id: 'navy-amber',
    nameEn: 'Executive Navy & Amber',
    nameBn: 'এক্সিকিউটিভ নেভি ও অ্যাম্বার',
    subtitleEn: 'Diagonal navy-orange header, clean ledger grid & faint emblem watermark',
    subtitleBn: 'ডায়াগোনাল নেভি-কমলা ব্যানার, সুবিন্যস্ত টেবিল ও ওয়াটারমার্ক',
    previewPrimary: '#0B3B54',
    previewAccent: '#F28C18',
    defaults: {
      showInvocation: false,
      invocationText: 'বিসমিল্লাহির রাহমানির রাহিম',
      memoTitle: 'Invoice / Cash Memo',
      businessName: '',
      slogan: '',
      proprietorLabel: '',
      businessDescription: '',
      phone: '',
      email: '',
      website: '',
      address: '',
      showLogo: true,
      showWatermark: true,
      primaryColor: '#0B3B54',
      accentColor: '#F28C18',
      tableHeaderColor: '#0B3B54',
      paperTint: '#FFFFFF',
      fontScale: 'standard',
      headerFontFamily: 'ibm-plex',
      headerTitleSize: 26,
      headerMetaSize: 11,
      bodyFontFamily: 'noto-sans',
      bodyFontSize: 12,
      tableFontFamily: 'noto-sans',
      tableHeaderSize: 12,
      tableCellSize: 12,
      footerFontFamily: 'noto-sans',
      footerFontSize: 12,
      minRows: 8,
      defaultIncludeVat: true,
      showBinNumber: true,
      showMushakRef: true,
      showPaymentMethod: true,
      showAmountInWords: true,
      showAdvanceAndDue: true,
      colSl: 'SL.No',
      colDesc: 'Description',
      colQty: 'Quantity',
      colRate: 'Rate',
      colAmount: 'Taka',
      footerNote: '',
      customerSignLabel: 'Received by',
      authorizedSignLabel: 'Authorized by',
    },
  },
  'crimson-black': {
    id: 'crimson-black',
    nameEn: 'Classic Crimson & Black',
    nameBn: 'ক্লাসিক ক্রিমসন ও ব্ল্যাক',
    subtitleEn: 'Bold crimson table header, skewed black Cash Memo badge & boxed date',
    subtitleBn: 'লাল টেবিল হেডার, কালো ক্যাশ মেমো ব্যাজ ও বক্সড তারিখ',
    previewPrimary: '#DC2626',
    previewAccent: '#111827',
    defaults: {
      showInvocation: false,
      invocationText: 'বিসমিল্লাহির রাহমানির রাহিম',
      memoTitle: 'CASH MEMO',
      businessName: '',
      slogan: '',
      proprietorLabel: '',
      businessDescription: '',
      phone: '',
      email: '',
      website: '',
      address: '',
      showLogo: true,
      showWatermark: false,
      primaryColor: '#DC2626',
      accentColor: '#111827',
      tableHeaderColor: '#DC2626',
      paperTint: '#FFFFFF',
      fontScale: 'standard',
      headerFontFamily: 'ibm-plex',
      headerTitleSize: 21,
      headerMetaSize: 11,
      bodyFontFamily: 'noto-sans',
      bodyFontSize: 12,
      tableFontFamily: 'noto-sans',
      tableHeaderSize: 12,
      tableCellSize: 12,
      footerFontFamily: 'noto-sans',
      footerFontSize: 11,
      minRows: 8,
      defaultIncludeVat: true,
      showBinNumber: true,
      showMushakRef: true,
      showPaymentMethod: true,
      showAmountInWords: true,
      showAdvanceAndDue: true,
      colSl: 'No:',
      colDesc: 'Description',
      colQty: 'Quantity',
      colRate: 'Rate',
      colAmount: 'Amount',
      footerNote: '',
      customerSignLabel: "Customer's Signature",
      authorizedSignLabel: 'Authorized Signature',
    },
  },
  'charcoal-gold': {
    id: 'charcoal-gold',
    nameEn: 'Charcoal & Industrial Gold',
    nameBn: 'চারকোল ও গোল্ড স্টুডিও',
    subtitleEn: 'Dark obsidian banner, bold gold contact strip & warm yellow ledger columns',
    subtitleBn: 'ডার্ক চারকোল হেডার, সোনালি কন্টাক্ট প্যানেল ও হলুদ কলাম',
    previewPrimary: '#111827',
    previewAccent: '#FACC15',
    defaults: {
      showInvocation: false,
      invocationText: 'বিসমিল্লাহির রাহমানির রাহিম',
      memoTitle: 'CASH MEMO',
      businessName: '',
      slogan: '',
      proprietorLabel: '',
      businessDescription: '',
      phone: '',
      email: '',
      website: '',
      address: '',
      showLogo: false,
      showWatermark: false,
      primaryColor: '#111827',
      accentColor: '#FACC15',
      tableHeaderColor: '#111827',
      paperTint: '#FEFCE8',
      fontScale: 'standard',
      headerFontFamily: 'ibm-plex',
      headerTitleSize: 25,
      headerMetaSize: 11,
      bodyFontFamily: 'noto-sans',
      bodyFontSize: 12,
      tableFontFamily: 'noto-sans',
      tableHeaderSize: 12,
      tableCellSize: 12,
      footerFontFamily: 'noto-sans',
      footerFontSize: 11,
      minRows: 8,
      defaultIncludeVat: true,
      showBinNumber: true,
      showMushakRef: true,
      showPaymentMethod: true,
      showAmountInWords: true,
      showAdvanceAndDue: true,
      colSl: 'No:',
      colDesc: 'Description',
      colQty: 'Quantity',
      colRate: 'Rate',
      colAmount: 'Amount',
      footerNote: '',
      customerSignLabel: "Customer's Signature",
      authorizedSignLabel: 'Authorized Signature',
    },
  },
  'bengali-classic': {
    id: 'bengali-classic',
    nameEn: 'Traditional Bangla Shop Memo',
    nameBn: 'ঐতিহ্যবাহী বাংলা ক্যাশ মেমো',
    subtitleEn: 'Bismillah header, proprietor badge, phone strip & colorful Bangla ledger columns',
    subtitleBn: 'বিসমিল্লাহ হেডার, প্রোপ্রাইটর ব্যাজ ও ঐতিহ্যবাহী রঙিন বাংলা টেবিল',
    previewPrimary: '#B91C1C',
    previewAccent: '#15803D',
    defaults: {
      showInvocation: true,
      invocationText: 'বিসমিল্লাহির রাহমানির রাহিম',
      memoTitle: 'ক্যাশ মেমো',
      businessName: '',
      slogan: '',
      proprietorLabel: '',
      businessDescription: '',
      phone: '',
      email: '',
      website: '',
      address: '',
      showLogo: true,
      showWatermark: true,
      primaryColor: '#B91C1C',
      accentColor: '#15803D',
      tableHeaderColor: '#15803D',
      paperTint: '#ECFDF5',
      fontScale: 'standard',
      headerFontFamily: 'baloo-da',
      headerTitleSize: 28,
      headerMetaSize: 12,
      bodyFontFamily: 'noto-sans',
      bodyFontSize: 12,
      tableFontFamily: 'noto-sans',
      tableHeaderSize: 12,
      tableCellSize: 12,
      footerFontFamily: 'noto-sans',
      footerFontSize: 12,
      minRows: 9,
      defaultIncludeVat: false,
      showBinNumber: true,
      showMushakRef: true,
      showPaymentMethod: true,
      showAmountInWords: true,
      showAdvanceAndDue: true,
      colSl: 'সংখ্যা',
      colDesc: 'বিবরণ',
      colQty: 'পরিমাণ',
      colRate: 'দর',
      colAmount: 'টাকা',
      footerNote: '',
      customerSignLabel: 'ক্রেতার স্বাক্ষর',
      authorizedSignLabel: 'বিক্রেতার স্বাক্ষর',
    },
  },
  'ocean-corporate': {
    id: 'ocean-corporate',
    nameEn: 'Ocean Blue Corporate Wave',
    nameBn: 'ওশান ব্লু কর্পোরেট ওয়েভ',
    subtitleEn: 'Curved royal blue contact header, numbered rows & centered thank-you footer',
    subtitleBn: 'নীল ওয়েভ হেডার, ম্যানেজার কন্টাক্ট কার্ড ও নম্বরযুক্ত সারি',
    previewPrimary: '#035397',
    previewAccent: '#0EA5E9',
    defaults: {
      showInvocation: false,
      invocationText: 'বিসমিল্লাহির রাহমানির রাহিম',
      memoTitle: 'CASH MEMO',
      businessName: '',
      slogan: '',
      proprietorLabel: '',
      businessDescription: '',
      phone: '',
      email: '',
      website: '',
      address: '',
      showLogo: true,
      showWatermark: false,
      primaryColor: '#035397',
      accentColor: '#0EA5E9',
      tableHeaderColor: '#035397',
      paperTint: '#F0F9FF',
      fontScale: 'standard',
      headerFontFamily: 'ibm-plex',
      headerTitleSize: 20,
      headerMetaSize: 11,
      bodyFontFamily: 'noto-sans',
      bodyFontSize: 12,
      tableFontFamily: 'noto-sans',
      tableHeaderSize: 12,
      tableCellSize: 12,
      footerFontFamily: 'noto-sans',
      footerFontSize: 12,
      minRows: 9,
      defaultIncludeVat: true,
      showBinNumber: true,
      showMushakRef: true,
      showPaymentMethod: true,
      showAmountInWords: true,
      showAdvanceAndDue: true,
      colSl: 'No:',
      colDesc: 'Description',
      colQty: 'Quantity',
      colRate: 'Rate',
      colAmount: 'Amount',
      footerNote: 'Thank You, Come Again',
      customerSignLabel: 'Customer Signature',
      authorizedSignLabel: 'Authorized Signature',
    },
  },
  'sunset-ember': {
    id: 'sunset-ember',
    nameEn: 'Sunset Ember & Onyx',
    nameBn: 'সানসেট অরেঞ্জ ও অনিক্স',
    subtitleEn: 'Curved orange-crimson ribbon, black right contact panel & warm amber totals',
    subtitleBn: 'কমলা-লাল কার্ভড ব্যানার, ব্ল্যাক কন্টাক্ট প্যানেল ও অ্যাম্বার টেবিল',
    previewPrimary: '#EA580C',
    previewAccent: '#111827',
    defaults: {
      showInvocation: false,
      invocationText: 'বিসমিল্লাহির রাহমানির রাহিম',
      memoTitle: 'Cash Memo',
      businessName: '',
      slogan: '',
      proprietorLabel: '',
      businessDescription: '',
      phone: '',
      email: '',
      website: '',
      address: '',
      showLogo: false,
      showWatermark: false,
      primaryColor: '#EA580C',
      accentColor: '#DC2626',
      tableHeaderColor: '#EA580C',
      paperTint: '#FFFBEB',
      fontScale: 'standard',
      headerFontFamily: 'hind-siliguri',
      headerTitleSize: 22,
      headerMetaSize: 11,
      bodyFontFamily: 'noto-sans',
      bodyFontSize: 12,
      tableFontFamily: 'noto-sans',
      tableHeaderSize: 12,
      tableCellSize: 12,
      footerFontFamily: 'noto-sans',
      footerFontSize: 11,
      minRows: 9,
      defaultIncludeVat: true,
      showBinNumber: true,
      showMushakRef: true,
      showPaymentMethod: true,
      showAmountInWords: true,
      showAdvanceAndDue: true,
      colSl: 'No:',
      colDesc: 'Description',
      colQty: 'Quantity',
      colRate: 'Rate',
      colAmount: 'Amount',
      footerNote: '',
      customerSignLabel: 'Customer Signature',
      authorizedSignLabel: 'Authorized Signature',
    },
  },
  'heritage-enterprise': {
    id: 'heritage-enterprise',
    nameEn: 'Heritage Bangla Enterprise',
    nameBn: 'মেসার্স ঐতিহ্যবাহী এন্টারপ্রাইজ',
    subtitleEn: 'Classic vertical Cash Memo ribbon, colorful Bangla columns & no-return footer strip',
    subtitleBn: 'ডানপাশে ক্যাশ মেমো রিবন, ৫-রঙের বাংলা টেবিল ও বিঃ দ্রঃ ফুটার বার',
    previewPrimary: '#1D4ED8',
    previewAccent: '#16A34A',
    defaults: {
      showInvocation: true,
      invocationText: 'বিসমিল্লাহির রাহমানির রাহিম',
      memoTitle: 'ক্যাশ মেমো',
      businessName: '',
      slogan: '',
      proprietorLabel: '',
      businessDescription: '',
      phone: '',
      email: '',
      website: '',
      address: '',
      showLogo: true,
      showWatermark: true,
      primaryColor: '#1D4ED8',
      accentColor: '#16A34A',
      tableHeaderColor: '#1E3A8A',
      paperTint: '#F0F9FF',
      fontScale: 'standard',
      headerFontFamily: 'tiro-bangla',
      headerTitleSize: 27,
      headerMetaSize: 12,
      bodyFontFamily: 'noto-sans',
      bodyFontSize: 12,
      tableFontFamily: 'noto-sans',
      tableHeaderSize: 12,
      tableCellSize: 12,
      footerFontFamily: 'noto-sans',
      footerFontSize: 11,
      minRows: 9,
      defaultIncludeVat: false,
      showBinNumber: true,
      showMushakRef: true,
      showPaymentMethod: true,
      showAmountInWords: true,
      showAdvanceAndDue: true,
      colSl: 'সংখ্যা',
      colDesc: 'বিবরণ',
      colQty: 'পরিমাণ',
      colRate: 'দর',
      colAmount: 'টাকা',
      footerNote: 'বিঃ দ্রঃ বিক্রিত মাল ফেরত লওয়া হয় না।',
      customerSignLabel: 'ক্রেতার স্বাক্ষর',
      authorizedSignLabel: 'বিক্রেতার স্বাক্ষর',
    },
  },
};

export function getDefaultCashMemoSettings(): CashMemoSettings {
  return {
    activeTemplateId: 'navy-amber',
    thermalPaperWidth: '80mm',
    templates: {},
  };
}

function safeHex(val: unknown, fallback: string): string {
  if (typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val.trim())) {
    return val.trim().toUpperCase();
  }
  return fallback;
}

function safeStr(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  return val.slice(0, maxLen);
}

function safeBool(val: unknown): boolean | undefined {
  return typeof val === 'boolean' ? val : undefined;
}

function safeFontId(val: unknown): CashMemoFontId | undefined {
  if (typeof val === 'string' && (CASH_MEMO_FONT_IDS as string[]).includes(val)) {
    return val as CashMemoFontId;
  }
  return undefined;
}

function safeClampedPx(val: unknown, min: number, max: number): number | undefined {
  if (typeof val !== 'number' || !Number.isFinite(val)) return undefined;
  return Math.max(min, Math.min(max, Math.round(val)));
}

export function sanitizeCashMemoSettings(raw: unknown): CashMemoSettings {
  const base = getDefaultCashMemoSettings();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;

  const activeId =
    typeof obj.activeTemplateId === 'string' &&
    (CASH_MEMO_TEMPLATE_IDS as string[]).includes(obj.activeTemplateId)
      ? (obj.activeTemplateId as CashMemoTemplateId)
      : base.activeTemplateId;

  const thermalPaperWidth: ThermalPaperWidth = obj.thermalPaperWidth === '58mm' ? '58mm' : '80mm';

  const sanitizedTemplates: CashMemoSettings['templates'] = {};
  if (obj.templates && typeof obj.templates === 'object') {
    const rawTemplates = obj.templates as Record<string, unknown>;
    for (const id of CASH_MEMO_TEMPLATE_IDS) {
      const entry = rawTemplates[id];
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const def = CASH_MEMO_TEMPLATES[id].defaults;
      const clean: Partial<CashMemoTemplateCustomization> = {};

      const boolFields: (keyof CashMemoTemplateCustomization)[] = [
        'showInvocation',
        'showLogo',
        'showWatermark',
        'defaultIncludeVat',
        'showBinNumber',
        'showMushakRef',
        'showPaymentMethod',
        'showAmountInWords',
        'showAdvanceAndDue',
      ];
      for (const f of boolFields) {
        const b = safeBool(e[f]);
        if (b !== undefined) (clean as Record<string, unknown>)[f] = b;
      }

      const strLimits: [keyof CashMemoTemplateCustomization, number][] = [
        ['invocationText', 100],
        ['memoTitle', 60],
        ['businessName', 120],
        ['slogan', 120],
        ['proprietorLabel', 100],
        ['businessDescription', 260],
        ['phone', 80],
        ['email', 100],
        ['website', 100],
        ['address', 220],
        ['colSl', 24],
        ['colDesc', 40],
        ['colQty', 24],
        ['colRate', 24],
        ['colAmount', 24],
        ['footerNote', 180],
        ['customerSignLabel', 60],
        ['authorizedSignLabel', 60],
      ];
      for (const [field, limit] of strLimits) {
        const s = safeStr(e[field], limit);
        if (s !== undefined) (clean as Record<string, unknown>)[field] = s;
      }

      if (typeof e.primaryColor === 'string') clean.primaryColor = safeHex(e.primaryColor, def.primaryColor);
      if (typeof e.accentColor === 'string') clean.accentColor = safeHex(e.accentColor, def.accentColor);
      if (typeof e.tableHeaderColor === 'string') clean.tableHeaderColor = safeHex(e.tableHeaderColor, def.tableHeaderColor);
      if (typeof e.paperTint === 'string') clean.paperTint = safeHex(e.paperTint, def.paperTint);

      if (e.fontScale === 'compact' || e.fontScale === 'standard' || e.fontScale === 'comfortable') {
        clean.fontScale = e.fontScale;
      }

      const hf = safeFontId(e.headerFontFamily);
      if (hf) clean.headerFontFamily = hf;
      const bf = safeFontId(e.bodyFontFamily);
      if (bf) clean.bodyFontFamily = bf;
      const tf = safeFontId(e.tableFontFamily);
      if (tf) clean.tableFontFamily = tf;
      const ff = safeFontId(e.footerFontFamily);
      if (ff) clean.footerFontFamily = ff;

      const hts = safeClampedPx(
        e.headerTitleSize,
        CASH_MEMO_FONT_SIZE_BOUNDS.headerTitleSize.min,
        CASH_MEMO_FONT_SIZE_BOUNDS.headerTitleSize.max
      );
      if (hts !== undefined) clean.headerTitleSize = hts;

      const hms = safeClampedPx(
        e.headerMetaSize,
        CASH_MEMO_FONT_SIZE_BOUNDS.headerMetaSize.min,
        CASH_MEMO_FONT_SIZE_BOUNDS.headerMetaSize.max
      );
      if (hms !== undefined) clean.headerMetaSize = hms;

      const bfs = safeClampedPx(
        e.bodyFontSize,
        CASH_MEMO_FONT_SIZE_BOUNDS.bodyFontSize.min,
        CASH_MEMO_FONT_SIZE_BOUNDS.bodyFontSize.max
      );
      if (bfs !== undefined) clean.bodyFontSize = bfs;

      const ths = safeClampedPx(
        e.tableHeaderSize,
        CASH_MEMO_FONT_SIZE_BOUNDS.tableHeaderSize.min,
        CASH_MEMO_FONT_SIZE_BOUNDS.tableHeaderSize.max
      );
      if (ths !== undefined) clean.tableHeaderSize = ths;

      const tcs = safeClampedPx(
        e.tableCellSize,
        CASH_MEMO_FONT_SIZE_BOUNDS.tableCellSize.min,
        CASH_MEMO_FONT_SIZE_BOUNDS.tableCellSize.max
      );
      if (tcs !== undefined) clean.tableCellSize = tcs;

      const ffs = safeClampedPx(
        e.footerFontSize,
        CASH_MEMO_FONT_SIZE_BOUNDS.footerFontSize.min,
        CASH_MEMO_FONT_SIZE_BOUNDS.footerFontSize.max
      );
      if (ffs !== undefined) clean.footerFontSize = ffs;

      if (typeof e.minRows === 'number' && Number.isFinite(e.minRows)) {
        clean.minRows = Math.max(0, Math.min(14, Math.round(e.minRows)));
      }

      sanitizedTemplates[id] = clean;
    }
  }

  return {
    activeTemplateId: activeId,
    thermalPaperWidth,
    templates: sanitizedTemplates,
  };
}

export function resolveCashMemoConfig(
  settings: CashMemoSettings | undefined,
  templateId: CashMemoTemplateId | undefined,
  org: Organization,
  lang: Language,
): { templateId: CashMemoTemplateId; config: CashMemoTemplateCustomization; thermalPaperWidth: ThermalPaperWidth } {
  const safeSettings = sanitizeCashMemoSettings(settings);
  const resolvedId = templateId ?? safeSettings.activeTemplateId;
  const defaults = CASH_MEMO_TEMPLATES[resolvedId].defaults;
  const overrides = safeSettings.templates[resolvedId] ?? {};
  const isBanglaTemplate = resolvedId === 'bengali-classic' || resolvedId === 'heritage-enterprise';
  const defaultOrgName = isBanglaTemplate || lang === 'bn' ? org.nameBn || org.name : org.name;

  const merged: CashMemoTemplateCustomization = {
    ...defaults,
    ...overrides,
    // Strictly Database-First: live Organization DB fields are the Single Source of Truth.
    // Template overrides only apply when the corresponding DB field is empty.
    businessName: defaultOrgName.trim() || overrides.businessName?.trim() || '',
    slogan: (org.tagline || '').trim() || overrides.slogan?.trim() || '',
    proprietorLabel: (org.proprietorName || '').trim() || overrides.proprietorLabel?.trim() || '',
    businessDescription: (org.businessDescription || '').trim() || overrides.businessDescription?.trim() || '',
    phone: (org.phone || '').trim() || overrides.phone?.trim() || '',
    email: (org.email || '').trim() || overrides.email?.trim() || '',
    website: (org.website || '').trim() || overrides.website?.trim() || '',
    address: (org.address || '').trim() || overrides.address?.trim() || '',
  };

  return {
    templateId: resolvedId,
    config: merged,
    thermalPaperWidth: safeSettings.thermalPaperWidth,
  };
}

/**
 * Builds an authentic, zero-dummy empty structural Cash Memo when the database has
 * no invoices yet. Contains ONLY real Organization/Branch context and empty row slots.
 */
export function buildEmptyStructuralInvoice(
  org: Organization,
  branch: { id: number; name: string; nameBn?: string; address?: string; phone?: string } | undefined,
  lang: Language,
): Invoice {
  const today = new Date().toISOString().slice(0, 10);
  const resolvedBranchName = branch
    ? lang === 'bn'
      ? branch.nameBn || branch.name
      : branch.name
    : '';
  return {
    id: 0,
    invoiceNumber: `${org.invoicePrefix || 'INV'}-`,
    mushakChallanNo: '',
    branchId: branch?.id ?? 0,
    branchName: resolvedBranchName,
    branchNameBn: branch?.nameBn || '',
    branchAddress: branch?.address || '',
    branchPhone: branch?.phone || '',
    customerId: 0,
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerBin: '',
    issueDate: today,
    dueDate: today,
    status: 'draft',
    source: 'pos',
    subtotal: 0,
    discountTotal: 0,
    vatTotal: 0,
    sdTotal: 0,
    grandTotal: 0,
    paidAmount: 0,
    balanceDue: 0,
    journalEntryId: null,
    notes: '',
    createdAt: `${today}T00:00:00Z`,
    items: [],
  };
}

/**
 * Pure Number-to-Words converter supporting South Asian Lakh/Crore numbering
 * in both English and Bengali for authentic Cash Memo "In Words / টাকা (কথায়)".
 */
export function amountToWords(amount: number, lang: Language): string {
  const rounded = Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0));

  if (lang === 'en') {
    if (rounded === 0) return 'Zero Taka Only';
    const ones = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen',
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const belowThousand = (n: number): string => {
      if (n === 0) return '';
      if (n < 20) return ones[n];
      if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`;
      return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${belowThousand(n % 100)}` : ''}`;
    };

    const parts: string[] = [];
    let rem = rounded;
    const crore = Math.floor(rem / 10000000);
    rem %= 10000000;
    const lakh = Math.floor(rem / 100000);
    rem %= 100000;
    const thousand = Math.floor(rem / 1000);
    rem %= 1000;

    if (crore) parts.push(`${belowThousand(crore)} Crore`);
    if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
    if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
    if (rem) parts.push(belowThousand(rem));

    return `${parts.join(' ')} Taka Only`;
  }

  // Authentic Bengali 0–99 word lookup
  if (rounded === 0) return 'শূন্য টাকা মাত্র';
  const bn0to99 = [
    '', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
    'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
    'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
    'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
    'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
    'পঞ্চাশ', 'একান্ন', 'বাহান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
    'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
    'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
    'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'ঊননব্বই',
    'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
  ];

  const bnBelowThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 100) return bn0to99[n];
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return `${bn0to99[h]} শত${rest ? ` ${bn0to99[rest]}` : ''}`;
  };

  const parts: string[] = [];
  let rem = rounded;
  const crore = Math.floor(rem / 10000000);
  rem %= 10000000;
  const lakh = Math.floor(rem / 100000);
  rem %= 100000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;

  if (crore) parts.push(`${bnBelowThousand(crore)} কোটি`);
  if (lakh) parts.push(`${bn0to99[lakh]} লক্ষ`);
  if (thousand) parts.push(`${bn0to99[thousand]} হাজার`);
  if (rem) parts.push(bnBelowThousand(rem));

  return `${parts.join(' ')} টাকা মাত্র`;
}

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeLogoHtml(org: Organization, primaryColor: string, size = 46): string {
  if (
    org.logoUrl &&
    (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(org.logoUrl) || org.logoUrl.startsWith('/src/assets/'))
  ) {
    return `<img src="${esc(org.logoUrl)}" alt="Logo" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:8px;background:#FFFFFF;padding:2px;border:1px solid rgba(15,23,42,0.12);flex-shrink:0;" />`;
  }
  const initials = (org.name || 'BP')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return `<div style="width:${size}px;height:${size}px;border-radius:10px;background:${esc(primaryColor)};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${Math.round(size * 0.36)}px;letter-spacing:0.04em;flex-shrink:0;">${esc(initials || 'BP')}</div>`;
}

function splitDateParts(isoDate: string): [string, string, string] {
  const parts = (isoDate || '').slice(0, 10).split('-');
  if (parts.length === 3) return [parts[2], parts[1], parts[0]];
  const now = new Date();
  return [
    String(now.getDate()).padStart(2, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getFullYear()),
  ];
}

export interface CashMemoRenderOptions {
  includeVat?: boolean;
  templateId?: CashMemoTemplateId;
  settings?: CashMemoSettings;
  paymentMethodLabel?: string;
}

/**
 * Computes line amounts & totals cleanly for either With-Mushak (includeVat=true)
 * or Without-Mushak (includeVat=false) Cash Memo exports.
 */
export function computeCashMemoFigures(invoice: Invoice, includeVat: boolean) {
  const items = (invoice.items || []).map((line) => {
    const qty = Number(line.quantity || 0);
    const rate = Number(line.unitPrice || 0);
    const grossWithoutVat = Number((line.taxableValue ?? qty * rate).toFixed(2));
    const displayAmount = includeVat ? Number((line.lineTotal ?? grossWithoutVat + (line.vatAmount || 0)).toFixed(2)) : grossWithoutVat;
    return {
      description: line.description,
      quantity: qty,
      rate,
      vatRate: Number(line.taxRate || 0),
      vatAmount: Number(line.vatAmount || 0),
      amount: displayAmount,
    };
  });

  const subtotal = Number(invoice.subtotal || 0);
  const vatTotal = includeVat ? Number(invoice.vatTotal || 0) : 0;
  const payableTotal = includeVat ? Number(invoice.grandTotal || subtotal + vatTotal) : subtotal;
  const paidAmount = Math.min(Number(invoice.paidAmount || 0), payableTotal);
  const dueAmount = Number(Math.max(0, payableTotal - paidAmount).toFixed(2));

  return { items, subtotal, vatTotal, payableTotal, paidAmount, dueAmount };
}

export function renderCashMemoHtml(
  invoice: Invoice,
  org: Organization,
  lang: Language,
  options: CashMemoRenderOptions = {},
): string {
  const { templateId, config } = resolveCashMemoConfig(
    options.settings ?? org.cashMemoSettings,
    options.templateId,
    org,
    lang,
  );
  const includeVat = options.includeVat ?? config.defaultIncludeVat;
  const isBanglaDoc = templateId === 'bengali-classic' || templateId === 'heritage-enterprise' || lang === 'bn';
  const numLang: Language = isBanglaDoc ? 'bn' : 'en';
  const isBlankStructure = invoice.id === 0 && (invoice.items?.length ?? 0) === 0;
  const money = (v: number) => (isBlankStructure ? '' : formatMoney(v, numLang, org.currencySymbol));
  const figs = computeCashMemoFigures(invoice, includeVat);
  const [dd, mm, yyyy] = splitDateParts(invoice.issueDate);
  const words = isBlankStructure ? '' : amountToWords(figs.payableTotal, numLang);
  const displayBranchName = (isBanglaDoc ? invoice.branchNameBn || invoice.branchName : invoice.branchName) || '';

  const headerFont = CASH_MEMO_FONTS[config.headerFontFamily]?.css || CASH_MEMO_FONTS['noto-sans'].css;
  const bodyFont = CASH_MEMO_FONTS[config.bodyFontFamily]?.css || CASH_MEMO_FONTS['noto-sans'].css;
  const tableFont = CASH_MEMO_FONTS[config.tableFontFamily]?.css || CASH_MEMO_FONTS['noto-sans'].css;
  const footerFont = CASH_MEMO_FONTS[config.footerFontFamily]?.css || CASH_MEMO_FONTS['noto-sans'].css;

  const hTitle = config.headerTitleSize;
  const hMeta = config.headerMetaSize;
  const bSize = config.bodyFontSize;
  const thSize = config.tableHeaderSize;
  const tdSize = config.tableCellSize;
  const fSize = config.footerFontSize;
  const totalSize = tdSize + 1;
  const badgeSize = Math.max(10, Math.min(20, Math.round(hMeta + 1)));
  const vatMetaSize = Math.max(9, hMeta - 1);

  const emptyRowCount = Math.max(0, config.minRows - figs.items.length);
  const rowPad = tdSize <= 10 ? '5px 8px' : tdSize >= 14 ? '9px 10px' : '7px 9px';

  const vatMetaPieces: string[] = [];
  if (includeVat && config.showBinNumber && org.binNumber) {
    vatMetaPieces.push(`BIN: ${esc(org.binNumber)}`);
  }
  if (includeVat && config.showMushakRef && invoice.mushakChallanNo) {
    vatMetaPieces.push(`${isBanglaDoc ? 'মূসক ৬.৩' : 'Mushak 6.3'}: ${esc(invoice.mushakChallanNo)}`);
  }
  if (config.showPaymentMethod && options.paymentMethodLabel) {
    vatMetaPieces.push(`${isBanglaDoc ? 'মাধ্যম' : 'Paid via'}: ${esc(options.paymentMethodLabel)}`);
  }
  const vatMetaBar = vatMetaPieces.length > 0
    ? `<div style="font-size:${vatMetaSize}px;color:#475569;margin-top:4px;font-family:${headerFont};">${vatMetaPieces.join(' &nbsp;·&nbsp; ')}</div>`
    : '';

  const buildStandardRows = (
    borderColor: string,
    opts?: {
      paddedSl?: boolean;
      descBg?: string;
      qtyBg?: string;
      rateBg?: string;
      amtBg?: string;
      horizontalBorders?: boolean;
    },
  ) => {
    const hBorder = opts?.horizontalBorders === false ? 'none' : `1px solid ${borderColor}`;
    const cellStyleBase = `font-family:${tableFont};font-size:${tdSize}px;`;
    const filled = figs.items
      .map((item, idx) => {
        const slText = opts?.paddedSl
          ? `${String(idx + 1).padStart(2, '0')}.`
          : formatNumber(idx + 1, numLang);
        return `
          <tr>
            <td style="${cellStyleBase}padding:${rowPad};border-right:1px solid ${borderColor};border-bottom:${hBorder};text-align:center;font-weight:600;color:#334155;">${esc(slText)}</td>
            <td style="${cellStyleBase}padding:${rowPad};border-right:1px solid ${borderColor};border-bottom:${hBorder};background:${opts?.descBg || 'transparent'};color:#0F172A;font-weight:500;">
              ${esc(item.description)}
              ${includeVat && item.vatRate > 0 ? `<span style="font-size:${Math.max(9, tdSize - 2)}px;color:#64748B;margin-left:4px;">(${isBanglaDoc ? 'মূসক' : 'VAT'} ${esc(formatNumber(item.vatRate, numLang))}%)</span>` : ''}
            </td>
            <td style="${cellStyleBase}padding:${rowPad};border-right:1px solid ${borderColor};border-bottom:${hBorder};background:${opts?.qtyBg || 'transparent'};text-align:center;">${esc(formatNumber(item.quantity, numLang))}</td>
            <td style="${cellStyleBase}padding:${rowPad};border-right:1px solid ${borderColor};border-bottom:${hBorder};background:${opts?.rateBg || 'transparent'};text-align:right;">${esc(money(item.rate))}</td>
            <td style="${cellStyleBase}padding:${rowPad};border-bottom:${hBorder};background:${opts?.amtBg || 'transparent'};text-align:right;font-weight:600;color:#0F172A;">${esc(money(item.amount))}</td>
          </tr>
        `;
      })
      .join('');

    const blanks = Array.from({ length: emptyRowCount })
      .map((_, bIdx) => {
        const idx = figs.items.length + bIdx;
        const slText = opts?.paddedSl ? `${String(idx + 1).padStart(2, '0')}.` : '';
        return `
          <tr>
            <td style="${cellStyleBase}padding:${rowPad};height:27px;border-right:1px solid ${borderColor};border-bottom:${hBorder};text-align:center;color:#94A3B8;">${esc(slText)}</td>
            <td style="${cellStyleBase}padding:${rowPad};height:27px;border-right:1px solid ${borderColor};border-bottom:${hBorder};background:${opts?.descBg || 'transparent'};">&nbsp;</td>
            <td style="${cellStyleBase}padding:${rowPad};height:27px;border-right:1px solid ${borderColor};border-bottom:${hBorder};background:${opts?.qtyBg || 'transparent'};">&nbsp;</td>
            <td style="${cellStyleBase}padding:${rowPad};height:27px;border-right:1px solid ${borderColor};border-bottom:${hBorder};background:${opts?.rateBg || 'transparent'};">&nbsp;</td>
            <td style="${cellStyleBase}padding:${rowPad};height:27px;border-bottom:${hBorder};background:${opts?.amtBg || 'transparent'};">&nbsp;</td>
          </tr>
        `;
      })
      .join('');

    return filled + blanks;
  };

  const watermarkHtml = config.showWatermark
    ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0.05;z-index:0;">
         <div style="font-family:${headerFont};font-size:64px;font-weight:900;letter-spacing:0.12em;color:${esc(config.primaryColor)};transform:rotate(-20deg);text-transform:uppercase;text-align:center;max-width:80%;">
           ${esc((config.businessName || org.name).slice(0, 18))}
         </div>
       </div>`
    : '';

  const outerStyle = `width:720px;box-sizing:border-box;background:${esc(config.paperTint)};color:#0F172A;font-family:${bodyFont};font-size:${bSize}px;line-height:1.4;border:1px solid #CBD5E1;overflow:hidden;position:relative;`;

  // =========================================================================
  // TEMPLATE 1: EXECUTIVE NAVY & AMBER (Screenshot 1)
  // =========================================================================
  if (templateId === 'navy-amber') {
    const p = config.primaryColor;
    const a = config.accentColor;
    const th = config.tableHeaderColor;
    return `
      <div style="${outerStyle}background:#FFFFFF;">
        <div style="height:26px;background:linear-gradient(115deg, ${esc(p)} 0%, ${esc(p)} 64%, #FFFFFF 64%, #FFFFFF 68%, ${esc(a)} 68%, ${esc(a)} 100%);"></div>
        <div style="padding:18px 26px 20px;">
          <div style="font-family:${headerFont};">
            ${config.showInvocation ? `<div style="text-align:center;font-size:${hMeta}px;color:#475569;margin-bottom:6px;">${esc(config.invocationText)}</div>` : ''}
            <div style="display:flex;align-items:center;gap:14px;">
              ${config.showLogo ? `<div style="text-align:center;flex-shrink:0;">${safeLogoHtml(org, p, 52)}</div>` : ''}
              <div style="flex:1;text-align:center;">
                <div style="font-family:${headerFont};font-size:${hTitle}px;font-weight:900;color:#0F172A;letter-spacing:0.02em;line-height:1.15;">${esc(config.businessName)}</div>
                ${config.slogan ? `<div style="font-size:${Math.max(10, hMeta)}px;font-weight:600;color:${esc(a)};margin-top:3px;">${esc(config.slogan)}</div>` : ''}
                <div style="font-size:${hMeta}px;color:#334155;margin-top:4px;">${esc(config.address)}</div>
                <div style="font-size:${hMeta}px;color:#334155;margin-top:2px;">
                  ${config.phone ? `${isBanglaDoc ? 'মোবা' : 'Mob'}: ${esc(config.phone)}` : ''}
                  ${config.phone && config.email ? ' &nbsp;·&nbsp; ' : ''}
                  ${config.email ? `${isBanglaDoc ? 'ইমেইল' : 'Email'}: ${esc(config.email)}` : ''}
                  ${(config.phone || config.email) && config.website ? ' &nbsp;·&nbsp; ' : ''}
                  ${config.website ? `${esc(config.website)}` : ''}
                </div>
                ${config.proprietorLabel ? `<div style="font-size:${hMeta}px;font-weight:700;color:${esc(p)};margin-top:2px;">${esc(config.proprietorLabel)}</div>` : ''}
                ${config.businessDescription ? `<div style="font-size:${Math.max(9, hMeta - 1)}px;color:#475569;margin-top:2px;">${esc(config.businessDescription)}</div>` : ''}
                ${vatMetaBar}
              </div>
            </div>

            <div style="text-align:center;margin:12px 0 14px;">
              <span style="display:inline-block;background:${esc(p)};color:#FFFFFF;padding:4px 22px;border-radius:4px;font-size:${badgeSize}px;font-weight:700;letter-spacing:0.03em;">
                ${esc(config.memoTitle)}
              </span>
            </div>
          </div>

          <div style="font-family:${bodyFont};font-size:${bSize}px;margin-bottom:12px;line-height:1.85;">
            <div style="display:flex;justify-content:space-between;gap:16px;">
              <div><strong>${isBanglaDoc ? 'ক্রমিক নং' : 'SL No'} :</strong> <span style="font-family:'IBM Plex Mono',monospace;font-weight:600;">${esc(invoice.invoiceNumber)}</span></div>
              <div><strong>${isBanglaDoc ? 'তারিখ' : 'Date'} :</strong> <span style="border-bottom:1px dotted #64748B;padding:0 12px 1px;">${esc(formatDate(invoice.issueDate, numLang))}</span></div>
            </div>
            <div style="display:flex;gap:6px;">
              <strong style="white-space:nowrap;">${isBanglaDoc ? 'নাম' : 'Name'} :</strong>
              <span style="flex:1;border-bottom:1px dotted #64748B;padding-left:6px;">${esc(invoice.customerName || '')}</span>
            </div>
            <div style="display:flex;gap:6px;">
              <strong style="white-space:nowrap;">${isBanglaDoc ? 'ঠিকানা' : 'Address'} :</strong>
              <span style="flex:1;border-bottom:1px dotted #64748B;padding-left:6px;">${esc(invoice.customerAddress || '')}</span>
            </div>
            <div style="display:flex;gap:16px;">
              <div style="flex:1;display:flex;gap:6px;">
                <strong style="white-space:nowrap;">${isBanglaDoc ? 'মোবাইল' : 'Mobile'} :</strong>
                <span style="flex:1;border-bottom:1px dotted #64748B;padding-left:6px;">${esc(invoice.customerPhone || '')}</span>
              </div>
              <div style="flex:1;display:flex;gap:6px;">
                <strong style="white-space:nowrap;">${isBanglaDoc ? 'শাখা' : 'Branch'} :</strong>
                <span style="flex:1;border-bottom:1px dotted #64748B;padding-left:6px;">${esc(displayBranchName)}</span>
              </div>
            </div>
          </div>

          <div style="position:relative;border:1.5px solid ${esc(p)};">
            ${watermarkHtml}
            <table style="width:100%;border-collapse:collapse;position:relative;z-index:1;font-family:${tableFont};">
              <thead>
                <tr style="background:${esc(th)};color:#FFFFFF;font-family:${tableFont};font-size:${thSize}px;">
                  <th style="padding:8px 6px;width:54px;border-right:1px solid rgba(255,255,255,0.25);">${esc(config.colSl)}</th>
                  <th style="padding:8px 10px;text-align:left;border-right:1px solid rgba(255,255,255,0.25);">${esc(config.colDesc)}</th>
                  <th style="padding:8px 8px;width:82px;border-right:1px solid rgba(255,255,255,0.25);">${esc(config.colQty)}</th>
                  <th style="padding:8px 8px;width:96px;border-right:1px solid rgba(255,255,255,0.25);text-align:right;">${esc(config.colRate)}</th>
                  <th style="padding:8px 10px;width:118px;text-align:right;">${esc(config.colAmount)}</th>
                </tr>
              </thead>
              <tbody>
                ${buildStandardRows(p, { horizontalBorders: false })}
              </tbody>
              <tfoot style="font-family:${tableFont};font-size:${tdSize}px;">
                <tr style="border-top:1.5px solid ${esc(p)};">
                  <td colspan="3" rowspan="${includeVat ? (config.showAdvanceAndDue ? 4 : 2) : (config.showAdvanceAndDue ? 3 : 1)}" style="padding:8px 10px;border-right:1px solid ${esc(p)};vertical-align:bottom;font-family:${footerFont};font-size:${fSize}px;color:#475569;">
                    ${config.footerNote ? esc(config.footerNote) : ''}
                  </td>
                  <td style="padding:6px 9px;border-right:1px solid ${esc(p)};border-bottom:1px solid ${esc(p)};font-weight:700;text-align:right;">${isBanglaDoc ? 'উপ-মোট' : 'Sub Total'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid ${esc(p)};font-weight:700;text-align:right;">${esc(money(figs.subtotal))}</td>
                </tr>
                ${includeVat ? `
                <tr>
                  <td style="padding:6px 9px;border-right:1px solid ${esc(p)};border-bottom:1px solid ${esc(p)};font-weight:600;text-align:right;color:#334155;">${isBanglaDoc ? 'মূসক (VAT)' : 'VAT'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid ${esc(p)};font-weight:600;text-align:right;">${esc(money(figs.vatTotal))}</td>
                </tr>` : ''}
                ${config.showAdvanceAndDue ? `
                <tr>
                  <td style="padding:6px 9px;border-right:1px solid ${esc(p)};border-bottom:1px solid ${esc(p)};font-weight:700;text-align:right;">${isBanglaDoc ? 'জমা / পরিশোধ' : 'Advance / Paid'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid ${esc(p)};font-weight:700;text-align:right;color:#0F766E;">${esc(money(figs.paidAmount))}</td>
                </tr>
                <tr>
                  <td style="padding:6px 9px;border-right:1px solid ${esc(p)};font-weight:700;text-align:right;">${isBanglaDoc ? 'বকেয়া' : 'Due'}</td>
                  <td style="padding:6px 10px;font-weight:800;text-align:right;font-size:${totalSize}px;color:${figs.dueAmount > 0 ? '#B91C1C' : '#0F172A'};">${esc(money(figs.dueAmount))}</td>
                </tr>` : `
                <tr>
                  <td style="padding:6px 9px;border-right:1px solid ${esc(p)};font-weight:800;text-align:right;font-size:${totalSize}px;">${isBanglaDoc ? 'সর্বমোট' : 'Total'}</td>
                  <td style="padding:6px 10px;font-weight:800;text-align:right;font-size:${totalSize}px;">${esc(money(figs.payableTotal))}</td>
                </tr>`}
              </tfoot>
            </table>
          </div>

          <div style="font-family:${footerFont};font-size:${fSize}px;">
            ${config.showAmountInWords ? `<div style="margin-top:10px;"><strong>${isBanglaDoc ? 'কথায়' : 'In Words'}:</strong> <span style="color:#1E293B;">${esc(words)}</span></div>` : ''}

            <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:34px;font-weight:600;color:#0F172A;">
              <div style="border-top:1.5px solid #0F172A;padding-top:4px;min-width:130px;text-align:center;">${esc(config.customerSignLabel)}</div>
              <div style="border-top:1.5px solid #0F172A;padding-top:4px;min-width:130px;text-align:center;">${esc(config.authorizedSignLabel)}</div>
            </div>
          </div>
        </div>
        <div style="height:18px;background:linear-gradient(115deg, ${esc(a)} 0%, ${esc(a)} 27%, #FFFFFF 27%, #FFFFFF 31%, ${esc(p)} 31%, ${esc(p)} 100%);"></div>
      </div>
    `;
  }

  // =========================================================================
  // TEMPLATE 2: CLASSIC CRIMSON & BLACK (Screenshot 2)
  // =========================================================================
  if (templateId === 'crimson-black') {
    const p = config.primaryColor;
    const a = config.accentColor;
    const th = config.tableHeaderColor;
    return `
      <div style="${outerStyle}background:#FFFFFF;">
        <div style="display:flex;height:14px;">
          <div style="width:48%;background:${esc(p)};"></div>
          <div style="width:52%;background:${esc(a)};"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:14px 24px 12px;border-bottom:2px solid ${esc(a)};font-family:${headerFont};">
          <div style="max-width:65%;">
            ${config.showInvocation ? `<div style="font-size:${Math.max(9, hMeta - 1)}px;color:#475569;margin-bottom:4px;">${esc(config.invocationText)}</div>` : ''}
            <div style="display:flex;align-items:center;gap:10px;">
              ${config.showLogo ? safeLogoHtml(org, p, 40) : ''}
              <div style="font-family:${headerFont};font-size:${hTitle}px;font-weight:900;color:#0F172A;letter-spacing:0.01em;line-height:1.15;">${esc(config.businessName)}</div>
            </div>
            <div style="margin-top:6px;font-size:${hMeta}px;font-weight:700;color:${esc(p)};line-height:1.45;">
              <div>${esc(config.address)}</div>
              <div>${esc(config.phone)}${config.email ? ` &nbsp;|&nbsp; ${esc(config.email)}` : ''}</div>
            </div>
            ${vatMetaBar}
          </div>
          <div style="background:${esc(a)};color:#FFFFFF;padding:14px 22px;font-family:${headerFont};font-size:${Math.max(14, Math.round(hTitle * 0.8))}px;font-weight:900;letter-spacing:0.05em;border-top:5px solid #64748B;text-align:center;min-width:170px;">
            ${esc(config.memoTitle)}
          </div>
        </div>

        <div style="padding:14px 24px 18px;">
          <div style="font-family:${bodyFont};font-size:${bSize}px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <div><strong>${isBanglaDoc ? 'নং:' : 'No:'}</strong> <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;margin-left:4px;">${esc(invoice.invoiceNumber)}</span></div>
              <div style="display:flex;align-items:center;gap:6px;">
                <strong>${isBanglaDoc ? 'তারিখ:' : 'Date:'}</strong>
                <div style="display:flex;border:1px solid #334155;">
                  <span style="padding:2px 10px;border-right:1px solid #334155;font-family:'IBM Plex Mono',monospace;">${esc(dd)}</span>
                  <span style="padding:2px 10px;border-right:1px solid #334155;font-family:'IBM Plex Mono',monospace;">${esc(mm)}</span>
                  <span style="padding:2px 10px;font-family:'IBM Plex Mono',monospace;">${esc(yyyy)}</span>
                </div>
              </div>
            </div>

            <div style="display:flex;align-items:stretch;gap:4px;margin-bottom:6px;">
              <div style="width:94px;background:${esc(a)};color:#FFFFFF;font-size:${Math.max(9, bSize - 1)}px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:4px 8px;">${isBanglaDoc ? 'নাম:' : 'NAME:'}</div>
              <div style="flex:1;border:1px solid #334155;padding:4px 10px;font-weight:600;">${esc(invoice.customerName)}</div>
            </div>
            <div style="display:flex;align-items:stretch;gap:4px;margin-bottom:12px;">
              <div style="width:94px;background:${esc(a)};color:#FFFFFF;font-size:${Math.max(9, bSize - 1)}px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:4px 8px;">${isBanglaDoc ? 'ঠিকানা:' : 'ADDRESS:'}</div>
              <div style="flex:1;border:1px solid #334155;padding:4px 10px;">${esc(invoice.customerAddress || invoice.customerPhone || '—')}</div>
            </div>
          </div>

          <div style="border:1.5px solid #1E293B;position:relative;">
            ${watermarkHtml}
            <table style="width:100%;border-collapse:collapse;position:relative;z-index:1;font-family:${tableFont};">
              <thead>
                <tr style="background:${esc(th)};color:#FFFFFF;font-family:${tableFont};font-size:${thSize}px;">
                  <th style="padding:7px 6px;width:54px;border-right:1px solid rgba(255,255,255,0.35);">${esc(config.colSl)}</th>
                  <th style="padding:7px 10px;text-align:left;border-right:1px solid rgba(255,255,255,0.35);">${esc(config.colDesc)}</th>
                  <th style="padding:7px 8px;width:82px;border-right:1px solid rgba(255,255,255,0.35);">${esc(config.colQty)}</th>
                  <th style="padding:7px 8px;width:96px;border-right:1px solid rgba(255,255,255,0.35);text-align:right;">${esc(config.colRate)}</th>
                  <th style="padding:7px 10px;width:118px;text-align:right;">${esc(config.colAmount)}</th>
                </tr>
              </thead>
              <tbody>
                ${buildStandardRows('#334155', { horizontalBorders: false })}
              </tbody>
              <tfoot style="font-family:${tableFont};font-size:${tdSize}px;">
                ${includeVat ? `
                <tr style="border-top:1px solid #334155;">
                  <td colspan="3" style="border-right:1px solid #334155;"></td>
                  <td style="padding:6px 9px;border-right:1px solid #334155;border-bottom:1px solid #334155;text-align:right;font-weight:600;">${isBanglaDoc ? 'মূসক (VAT)' : 'VAT'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid #334155;text-align:right;font-weight:600;">${esc(money(figs.vatTotal))}</td>
                </tr>` : ''}
                <tr style="border-top:1.5px solid #1E293B;">
                  <td colspan="3" style="padding:6px 10px;border-right:1px solid #334155;font-size:${Math.max(9, tdSize - 1)}px;color:#475569;">
                    ${config.showAdvanceAndDue ? `${isBanglaDoc ? 'জমা' : 'Paid'}: <strong>${esc(money(figs.paidAmount))}</strong> &nbsp;·&nbsp; ${isBanglaDoc ? 'বকেয়া' : 'Due'}: <strong>${esc(money(figs.dueAmount))}</strong>` : ''}
                  </td>
                  <td style="padding:7px 9px;border-right:1px solid #334155;font-weight:800;text-align:right;font-size:${totalSize}px;">${isBanglaDoc ? 'সর্বমোট-' : 'Total-'}</td>
                  <td style="padding:7px 10px;font-weight:800;text-align:right;font-size:${totalSize}px;color:${esc(p)};">${esc(money(figs.payableTotal))}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style="font-family:${footerFont};font-size:${fSize}px;">
            ${config.showAmountInWords ? `
            <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
              <span style="color:${esc(p)};font-weight:700;white-space:nowrap;">${isBanglaDoc ? 'টাকা (কথায়)' : 'Taka (In word)'}</span>
              <div style="flex:1;border:1px solid #64748B;padding:4px 10px;color:#0F172A;">${esc(words)}</div>
            </div>` : ''}

            <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:32px;font-weight:600;">
              <div>${esc(config.customerSignLabel)}</div>
              ${config.footerNote ? `<div style="color:#64748B;font-weight:500;">${esc(config.footerNote)}</div>` : ''}
              <div>${esc(config.authorizedSignLabel)}</div>
            </div>
          </div>
        </div>

        <div style="height:18px;background:linear-gradient(125deg, ${esc(p)} 0%, ${esc(p)} 16%, ${esc(a)} 16%, ${esc(a)} 84%, ${esc(p)} 84%, ${esc(p)} 100%);"></div>
      </div>
    `;
  }

  // =========================================================================
  // TEMPLATE 3: CHARCOAL & INDUSTRIAL GOLD (Screenshot 3)
  // =========================================================================
  if (templateId === 'charcoal-gold') {
    const p = config.primaryColor;
    const a = config.accentColor;
    const th = config.tableHeaderColor;
    const tint = config.paperTint;
    return `
      <div style="${outerStyle}background:#FFFFFF;">
        <div style="display:flex;background:${esc(p)};min-height:106px;font-family:${headerFont};">
          <div style="flex:1;padding:18px 24px;display:flex;flex-direction:column;justify-content:center;">
            ${config.showInvocation ? `<div style="font-size:${Math.max(9, hMeta - 1)}px;color:rgba(255,255,255,0.7);margin-bottom:4px;">${esc(config.invocationText)}</div>` : ''}
            <div style="font-family:${headerFont};font-size:${hTitle}px;font-weight:900;color:${esc(a)};letter-spacing:0.02em;line-height:1.15;">${esc(config.businessName)}</div>
            ${config.slogan ? `<div style="font-size:${Math.max(10, hMeta + 1)}px;font-weight:600;color:${esc(a)};opacity:0.92;margin-top:4px;letter-spacing:0.05em;">${esc(config.slogan)}</div>` : ''}
          </div>
          <div style="width:245px;background:${esc(a)};color:${esc(p)};padding:14px 18px 14px 28px;clip-path:polygon(14% 0, 100% 0, 100% 100%, 0 100%);display:flex;flex-direction:column;justify-content:center;gap:4px;font-size:${hMeta}px;font-weight:600;">
            ${config.address ? `<div>● ${esc(config.address.slice(0, 48))}</div>` : ''}
            ${config.phone ? `<div>● ${esc(config.phone)}</div>` : ''}
            ${config.email ? `<div>● ${esc(config.email)}</div>` : ''}
            ${config.website ? `<div>● ${esc(config.website)}</div>` : ''}
          </div>
        </div>

        <div style="padding:14px 24px 18px;">
          <div style="font-family:${bodyFont};font-size:${bSize}px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <div>
                <strong>${isBanglaDoc ? 'ক্রমিক নং:' : 'No:'}</strong> <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;">${esc(invoice.invoiceNumber)}</span>
                ${vatMetaBar}
              </div>
              <div style="display:flex;align-items:stretch;border:1px solid ${esc(p)};">
                <span style="background:${esc(p)};color:#FFFFFF;padding:3px 10px;font-weight:700;font-size:${Math.max(9, bSize - 1)}px;">${isBanglaDoc ? 'তারিখ' : 'Date'}</span>
                <span style="padding:3px 10px;border-right:1px solid #64748B;font-family:'IBM Plex Mono',monospace;">${esc(dd)}</span>
                <span style="padding:3px 10px;border-right:1px solid #64748B;font-family:'IBM Plex Mono',monospace;">${esc(mm)}</span>
                <span style="padding:3px 10px;font-family:'IBM Plex Mono',monospace;">${esc(yyyy)}</span>
              </div>
            </div>

            <div style="display:flex;margin-bottom:6px;border:1px solid ${esc(p)};">
              <div style="width:94px;background:${esc(p)};color:#FFFFFF;font-size:${Math.max(9, bSize - 1)}px;font-weight:700;padding:4px 8px;text-align:center;">${isBanglaDoc ? 'নাম' : 'NAME'}</div>
              <div style="flex:1;padding:4px 10px;font-weight:600;">${esc(invoice.customerName)}</div>
            </div>
            <div style="display:flex;margin-bottom:12px;border:1px solid ${esc(p)};">
              <div style="width:94px;background:${esc(p)};color:#FFFFFF;font-size:${Math.max(9, bSize - 1)}px;font-weight:700;padding:4px 8px;text-align:center;">${isBanglaDoc ? 'ঠিকানা' : 'ADDRESS'}</div>
              <div style="flex:1;padding:4px 10px;">${esc(invoice.customerAddress || invoice.customerPhone || '—')}</div>
            </div>
          </div>

          <div style="border:1.5px solid ${esc(p)};position:relative;">
            ${watermarkHtml}
            <table style="width:100%;border-collapse:collapse;position:relative;z-index:1;font-family:${tableFont};">
              <thead>
                <tr style="background:${esc(th)};color:#FFFFFF;font-family:${tableFont};font-size:${thSize}px;">
                  <th style="padding:8px 6px;width:54px;border-right:1px solid rgba(255,255,255,0.22);">${esc(config.colSl)}</th>
                  <th style="padding:8px 10px;text-align:left;border-right:1px solid rgba(255,255,255,0.22);">${esc(config.colDesc)}</th>
                  <th style="padding:8px 8px;width:82px;border-right:1px solid rgba(255,255,255,0.22);">${esc(config.colQty)}</th>
                  <th style="padding:8px 8px;width:96px;border-right:1px solid rgba(255,255,255,0.22);text-align:right;">${esc(config.colRate)}</th>
                  <th style="padding:8px 10px;width:118px;text-align:right;">${esc(config.colAmount)}</th>
                </tr>
              </thead>
              <tbody>
                ${buildStandardRows(p, { descBg: tint, rateBg: tint, horizontalBorders: false })}
              </tbody>
              <tfoot style="font-family:${tableFont};font-size:${tdSize}px;">
                ${includeVat ? `
                <tr style="border-top:1px solid ${esc(p)};">
                  <td colspan="3" style="border-right:1px solid ${esc(p)};"></td>
                  <td style="padding:6px 9px;border-right:1px solid ${esc(p)};border-bottom:1px solid ${esc(p)};text-align:right;font-weight:600;">${isBanglaDoc ? 'মূসক (VAT)' : 'VAT'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid ${esc(p)};text-align:right;font-weight:600;">${esc(money(figs.vatTotal))}</td>
                </tr>` : ''}
                <tr style="border-top:1.5px solid ${esc(p)};">
                  <td colspan="3" style="padding:7px 10px;border-right:1px solid ${esc(p)};font-size:${Math.max(9, tdSize - 1)}px;color:#475569;">
                    ${config.showAdvanceAndDue ? `${isBanglaDoc ? 'জমা' : 'Paid'}: <strong>${esc(money(figs.paidAmount))}</strong> &nbsp;·&nbsp; ${isBanglaDoc ? 'বকেয়া' : 'Due'}: <strong>${esc(money(figs.dueAmount))}</strong>` : ''}
                  </td>
                  <td style="padding:7px 9px;border-right:1px solid ${esc(p)};text-align:right;font-weight:800;font-size:${totalSize}px;">${isBanglaDoc ? 'সর্বমোট-' : 'Total-'}</td>
                  <td style="padding:7px 10px;text-align:right;font-weight:800;font-size:${totalSize}px;">${esc(money(figs.payableTotal))}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style="font-family:${footerFont};font-size:${fSize}px;">
            ${config.showAmountInWords ? `<div style="margin-top:12px;display:flex;gap:6px;"><strong style="white-space:nowrap;">${isBanglaDoc ? 'টাকা (কথায়):' : 'Taka (In word):'}</strong><span style="flex:1;border-bottom:1px dotted #475569;padding-left:4px;">${esc(words)}</span></div>` : ''}

            <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:34px;font-weight:600;">
              <div style="border-top:1px solid #334155;padding-top:4px;min-width:128px;text-align:center;">${esc(config.customerSignLabel)}</div>
              ${config.footerNote ? `<div style="color:#64748B;font-weight:500;">${esc(config.footerNote)}</div>` : ''}
              <div style="border-top:1px solid #334155;padding-top:4px;min-width:128px;text-align:center;">${esc(config.authorizedSignLabel)}</div>
            </div>
          </div>
        </div>

        <div style="display:flex;height:16px;">
          <div style="width:20%;background:${esc(p)};"></div>
          <div style="width:10%;background:#716A14;"></div>
          <div style="width:40%;background:${esc(a)};"></div>
          <div style="width:10%;background:#716A14;"></div>
          <div style="width:20%;background:${esc(p)};"></div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // TEMPLATE 4: TRADITIONAL BANGLA SHOP MEMO (Screenshot 4)
  // =========================================================================
  if (templateId === 'bengali-classic') {
    const p = config.primaryColor; // crimson
    const a = config.accentColor; // green
    const th = config.tableHeaderColor;
    const tint = config.paperTint;
    return `
      <div style="${outerStyle}background:${esc(tint)};border-top:5px solid #1E3A8A;">
        <div style="background:linear-gradient(180deg, #FFFBEB 0%, #FFFFFF 100%);padding:12px 22px 10px;position:relative;font-family:${headerFont};">
          ${config.showInvocation ? `<div style="text-align:center;font-size:${hMeta}px;font-weight:600;color:#334155;margin-bottom:4px;">${esc(config.invocationText)}</div>` : ''}
          <div style="display:flex;align-items:center;justify-content:center;gap:14px;">
            ${config.showLogo ? safeLogoHtml(org, p, 52) : ''}
            <div style="text-align:center;">
              <div style="font-family:${headerFont};font-size:${hTitle}px;font-weight:900;color:${esc(p)};line-height:1.15;letter-spacing:0.01em;">${esc(config.businessName)}</div>
              <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:6px;flex-wrap:wrap;">
                ${config.proprietorLabel ? `<span style="background:${esc(p)};color:#FFFFFF;padding:3px 16px;border-radius:6px;font-size:${hMeta}px;font-weight:700;">${esc(config.proprietorLabel)}</span>` : ''}
                ${config.phone ? `<span style="background:#FEF08A;border:1px solid #CA8A04;color:#0F172A;padding:3px 12px;border-radius:999px;font-size:${hMeta}px;font-weight:700;">☎ ${esc(config.phone)}</span>` : ''}
              </div>
            </div>
          </div>
          ${config.businessDescription ? `<div style="text-align:center;font-size:${hMeta}px;color:#1E293B;margin-top:8px;font-weight:500;">${esc(config.businessDescription)}</div>` : ''}
          ${vatMetaBar ? `<div style="text-align:center;">${vatMetaBar}</div>` : ''}
        </div>

        <div style="display:flex;align-items:center;background:#FFFFFF;border-top:1px solid #E2E8F0;border-bottom:1px solid #CBD5E1;font-family:${headerFont};">
          <div style="width:110px;background:${esc(p)};color:#FFFFFF;text-align:center;padding:5px 8px;font-size:11px;letter-spacing:4px;">••••</div>
          <div style="flex:1;text-align:center;font-size:${hMeta}px;font-weight:700;color:#7E22CE;padding:5px 10px;">📍 ${esc(config.address)}</div>
          <div style="width:110px;background:${esc(p)};color:#FFFFFF;text-align:center;padding:5px 8px;font-size:11px;letter-spacing:4px;">••••</div>
        </div>

        <div style="padding:12px 22px 16px;">
          <div style="font-family:${bodyFont};font-size:${bSize}px;">
            <div style="display:flex;gap:10px;margin-bottom:6px;align-items:stretch;">
              <div style="flex:1;display:flex;gap:4px;">
                <span style="background:#0284C7;color:#FFFFFF;padding:3px 10px;border-radius:4px;font-weight:700;font-size:${Math.max(9, bSize - 1)}px;white-space:nowrap;">ক্রমিক নং</span>
                <span style="flex:1;background:#FEF9C3;border:1px solid #FDE047;border-radius:4px;padding:3px 10px;font-family:'IBM Plex Mono',monospace;font-weight:700;">${esc(invoice.invoiceNumber)}</span>
              </div>
              <div style="width:225px;display:flex;gap:4px;">
                <span style="background:#0284C7;color:#FFFFFF;padding:3px 10px;border-radius:4px;font-weight:700;font-size:${Math.max(9, bSize - 1)}px;white-space:nowrap;">তারিখ</span>
                <span style="flex:1;background:#FEF9C3;border:1px solid #FDE047;border-radius:4px;padding:3px 10px;font-weight:600;">${esc(formatDate(invoice.issueDate, 'bn'))}</span>
              </div>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:6px;">
              <span style="width:68px;background:${esc(p)};color:#FFFFFF;padding:3px 10px;border-radius:4px;font-weight:700;font-size:${Math.max(9, bSize - 1)}px;text-align:center;">নাম</span>
              <span style="flex:1;background:#FEF9C3;border:1px solid #FDE047;border-radius:4px;padding:3px 10px;font-weight:600;">${esc(invoice.customerName)}</span>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:10px;">
              <span style="width:68px;background:${esc(a)};color:#FFFFFF;padding:3px 10px;border-radius:4px;font-weight:700;font-size:${Math.max(9, bSize - 1)}px;text-align:center;">ঠিকানা</span>
              <span style="flex:1;background:#FEF9C3;border:1px solid #FDE047;border-radius:4px;padding:3px 10px;">${esc(invoice.customerAddress || invoice.customerPhone || '—')}</span>
            </div>
          </div>

          <div style="border:1.5px solid #475569;background:#FFFFFF;position:relative;">
            ${watermarkHtml}
            <table style="width:100%;border-collapse:collapse;position:relative;z-index:1;font-family:${tableFont};">
              <thead>
                <tr style="color:#FFFFFF;font-family:${tableFont};font-size:${thSize}px;">
                  <th style="padding:7px 6px;width:54px;background:${esc(th)};border-right:1px solid #FFFFFF;">${esc(config.colSl)}</th>
                  <th style="padding:7px 10px;text-align:left;background:${esc(th)};border-right:1px solid #FFFFFF;">${esc(config.colDesc)}</th>
                  <th style="padding:7px 8px;width:80px;background:${esc(p)};border-right:1px solid #FFFFFF;">${esc(config.colQty)}</th>
                  <th style="padding:7px 8px;width:96px;background:#0284C7;border-right:1px solid #FFFFFF;text-align:right;">${esc(config.colRate)}</th>
                  <th style="padding:7px 10px;width:118px;background:#DC2626;text-align:right;">${esc(config.colAmount)}</th>
                </tr>
              </thead>
              <tbody>
                ${buildStandardRows('#94A3B8', { qtyBg: '#FDF2F8', amtBg: '#F0F9FF' })}
              </tbody>
              <tfoot style="font-family:${tableFont};font-size:${tdSize}px;">
                ${includeVat ? `
                <tr>
                  <td colspan="3" style="border-right:1px solid #94A3B8;background:#FFFFFF;"></td>
                  <td style="padding:6px 8px;background:#0F766E;color:#FFFFFF;font-weight:700;text-align:center;border-bottom:1px solid #FFFFFF;">মূসক =</td>
                  <td style="padding:6px 10px;background:#F0F9FF;font-weight:700;text-align:right;border-bottom:1px solid #94A3B8;">${esc(money(figs.vatTotal))}</td>
                </tr>` : ''}
                <tr>
                  <td colspan="3" style="border-right:1px solid #94A3B8;background:#FFFFFF;padding:5px 10px;font-family:${footerFont};font-size:${fSize}px;color:#475569;">${config.footerNote ? esc(config.footerNote) : ''}</td>
                  <td style="padding:6px 8px;background:#0284C7;color:#FFFFFF;font-weight:700;text-align:center;border-bottom:1px solid #FFFFFF;">মোট =</td>
                  <td style="padding:6px 10px;background:#F0F9FF;font-weight:800;text-align:right;font-size:${totalSize}px;border-bottom:1px solid #94A3B8;">${esc(money(figs.payableTotal))}</td>
                </tr>
                ${config.showAdvanceAndDue ? `
                <tr>
                  <td colspan="3" style="border-right:1px solid #94A3B8;background:#FFFFFF;"></td>
                  <td style="padding:6px 8px;background:${esc(p)};color:#FFFFFF;font-weight:700;text-align:center;border-bottom:1px solid #FFFFFF;">জমা =</td>
                  <td style="padding:6px 10px;background:#F0F9FF;font-weight:700;text-align:right;border-bottom:1px solid #94A3B8;">${esc(money(figs.paidAmount))}</td>
                </tr>
                <tr>
                  <td colspan="3" style="border-right:1px solid #94A3B8;background:#FFFFFF;"></td>
                  <td style="padding:6px 8px;background:#0369A1;color:#FFFFFF;font-weight:700;text-align:center;">অবশিষ্ট =</td>
                  <td style="padding:6px 10px;background:#F0F9FF;font-weight:800;text-align:right;font-size:${totalSize}px;">${esc(money(figs.dueAmount))}</td>
                </tr>` : ''}
              </tfoot>
            </table>
          </div>

          <div style="font-family:${footerFont};font-size:${fSize}px;">
            ${config.showAmountInWords ? `<div style="margin-top:10px;display:flex;gap:6px;"><strong style="white-space:nowrap;">টাকা (কথায়):</strong><span style="flex:1;border-bottom:1px dotted #334155;padding-left:4px;">${esc(words)}</span></div>` : ''}

            <div style="display:flex;justify-content:space-between;margin-top:26px;font-weight:700;color:#0F172A;">
              <span>${esc(config.customerSignLabel)}</span>
              <span>${esc(config.authorizedSignLabel)}</span>
            </div>
          </div>
        </div>
        <div style="height:10px;background:linear-gradient(90deg, ${esc(p)}, #F97316, ${esc(p)});"></div>
      </div>
    `;
  }

  // =========================================================================
  // TEMPLATE 5: OCEAN BLUE CORPORATE WAVE (Screenshot 5)
  // =========================================================================
  if (templateId === 'ocean-corporate') {
    const p = config.primaryColor;
    const a = config.accentColor;
    const th = config.tableHeaderColor;
    const tint = config.paperTint;
    return `
      <div style="${outerStyle}background:#FFFFFF;">
        <div style="display:flex;background:linear-gradient(105deg, #FFFFFF 0%, #FFFFFF 56%, ${esc(p)} 56.5%, ${esc(a)} 100%);min-height:118px;border-top:4px solid ${esc(a)};font-family:${headerFont};">
          <div style="width:57%;padding:16px 22px;display:flex;flex-direction:column;justify-content:center;text-align:center;">
            ${config.showInvocation ? `<div style="font-size:${Math.max(9, hMeta - 1)}px;color:#64748B;margin-bottom:3px;">${esc(config.invocationText)}</div>` : ''}
            <div style="display:flex;justify-content:center;align-items:center;gap:8px;">
              ${config.showLogo ? safeLogoHtml(org, p, 34) : ''}
              <div style="font-family:${headerFont};font-size:${hTitle}px;font-weight:900;color:${esc(p)};letter-spacing:0.04em;line-height:1.15;">${esc(config.businessName)}</div>
            </div>
            ${config.slogan ? `<div style="font-size:${Math.max(9, hMeta - 1)}px;font-weight:700;color:${esc(a)};letter-spacing:0.14em;margin-top:3px;">${esc(config.slogan)}</div>` : ''}
            ${config.businessDescription ? `<div style="font-size:${Math.max(9, hMeta - 1)}px;color:#475569;margin-top:5px;line-height:1.35;">${esc(config.businessDescription)}</div>` : ''}
          </div>
          <div style="width:43%;padding:16px 20px 16px 34px;color:#FFFFFF;display:flex;flex-direction:column;justify-content:center;gap:4px;">
            ${config.proprietorLabel ? `<div style="font-size:${Math.max(12, hMeta + 3)}px;font-weight:800;letter-spacing:0.03em;">${esc(config.proprietorLabel)}</div>` : ''}
            ${config.phone ? `<div style="font-size:${hMeta}px;">☎ ${esc(config.phone)}</div>` : ''}
            ${config.email ? `<div style="font-size:${hMeta}px;">✉ ${esc(config.email)}</div>` : ''}
            ${config.website ? `<div style="font-size:${hMeta}px;">🌐 ${esc(config.website)}</div>` : ''}
          </div>
        </div>
        <div style="background:${esc(p)};color:#FFFFFF;text-align:center;padding:5px 16px;font-family:${headerFont};font-size:${hMeta}px;font-weight:600;letter-spacing:0.06em;">
          📍 ${esc(config.address)}
        </div>

        <div style="padding:14px 24px 16px;">
          <div style="font-family:${bodyFont};font-size:${bSize}px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div>
                <strong style="color:${esc(p)};">${isBanglaDoc ? 'নং:' : 'No:'}</strong> <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;">${esc(invoice.invoiceNumber)}</span>
                ${vatMetaBar}
              </div>
              <div style="display:flex;align-items:stretch;border:1px solid ${esc(p)};">
                <span style="background:${esc(p)};color:#FFFFFF;padding:3px 10px;font-weight:700;font-size:${Math.max(9, bSize - 1)}px;">${isBanglaDoc ? 'তারিখ:' : 'Date:'}</span>
                <span style="padding:3px 10px;border-right:1px solid ${esc(p)};font-family:'IBM Plex Mono',monospace;">${esc(dd)}</span>
                <span style="padding:3px 10px;border-right:1px solid ${esc(p)};font-family:'IBM Plex Mono',monospace;">${esc(mm)}</span>
                <span style="padding:3px 10px;font-family:'IBM Plex Mono',monospace;">${esc(yyyy)}</span>
              </div>
            </div>

            <div style="display:flex;margin-bottom:6px;border:1px solid ${esc(p)};">
              <div style="width:86px;background:${esc(p)};color:#FFFFFF;font-size:${Math.max(9, bSize - 1)}px;font-weight:700;padding:4px 8px;text-align:center;">${isBanglaDoc ? 'নাম:' : 'Name:'}</div>
              <div style="flex:1;padding:4px 10px;font-weight:600;">${esc(invoice.customerName)}</div>
            </div>
            <div style="display:flex;margin-bottom:12px;border:1px solid ${esc(p)};">
              <div style="width:86px;background:${esc(p)};color:#FFFFFF;font-size:${Math.max(9, bSize - 1)}px;font-weight:700;padding:4px 8px;text-align:center;">${isBanglaDoc ? 'ঠিকানা:' : 'Address:'}</div>
              <div style="flex:1;padding:4px 10px;">${esc(invoice.customerAddress || invoice.customerPhone || '—')}</div>
            </div>
          </div>

          <div style="border:1.5px solid ${esc(p)};position:relative;">
            ${watermarkHtml}
            <table style="width:100%;border-collapse:collapse;position:relative;z-index:1;font-family:${tableFont};">
              <thead>
                <tr style="background:${esc(th)};color:#FFFFFF;font-family:${tableFont};font-size:${thSize}px;">
                  <th style="padding:7px 6px;width:54px;border-right:1px solid rgba(255,255,255,0.3);">${esc(config.colSl)}</th>
                  <th style="padding:7px 10px;text-align:left;border-right:1px solid rgba(255,255,255,0.3);">${esc(config.colDesc)}</th>
                  <th style="padding:7px 8px;width:82px;border-right:1px solid rgba(255,255,255,0.3);">${esc(config.colQty)}</th>
                  <th style="padding:7px 8px;width:96px;border-right:1px solid rgba(255,255,255,0.3);text-align:right;">${esc(config.colRate)}</th>
                  <th style="padding:7px 10px;width:118px;text-align:right;">${esc(config.colAmount)}</th>
                </tr>
              </thead>
              <tbody>
                ${buildStandardRows('#94A3B8', { paddedSl: true, amtBg: tint })}
              </tbody>
              <tfoot style="font-family:${tableFont};font-size:${tdSize}px;">
                <tr style="border-top:1.5px solid ${esc(p)};">
                  <td colspan="3" rowspan="${includeVat ? (config.showAdvanceAndDue ? 4 : 2) : (config.showAdvanceAndDue ? 3 : 1)}" style="padding:10px 12px;border-right:1px solid #94A3B8;vertical-align:top;font-family:${footerFont};font-size:${fSize}px;">
                    ${config.showAmountInWords ? `<strong style="color:${esc(p)};">${isBanglaDoc ? 'টাকা (কথায়):' : 'Taka (In word):'}</strong><div style="margin-top:4px;color:#1E293B;">${esc(words)}</div>` : ''}
                  </td>
                  <td style="padding:6px 10px;border-right:1px solid #94A3B8;border-bottom:1px solid #94A3B8;font-weight:800;color:${esc(p)};text-align:right;">${isBanglaDoc ? 'মোট-' : 'Total-'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid #94A3B8;font-weight:800;text-align:right;">${esc(money(includeVat ? figs.subtotal : figs.payableTotal))}</td>
                </tr>
                ${includeVat ? `
                <tr>
                  <td style="padding:6px 10px;border-right:1px solid #94A3B8;border-bottom:1px solid #94A3B8;font-weight:700;color:${esc(p)};text-align:right;">${isBanglaDoc ? 'মূসক (VAT)' : 'VAT'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid #94A3B8;font-weight:700;text-align:right;">${esc(money(figs.vatTotal))}</td>
                </tr>` : ''}
                ${config.showAdvanceAndDue ? `
                <tr>
                  <td style="padding:6px 10px;border-right:1px solid #94A3B8;border-bottom:1px solid #94A3B8;font-weight:700;color:${esc(p)};text-align:right;">${isBanglaDoc ? 'জমা' : 'Advance'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid #94A3B8;font-weight:700;text-align:right;">${esc(money(figs.paidAmount))}</td>
                </tr>
                <tr>
                  <td style="padding:6px 10px;border-right:1px solid #94A3B8;font-weight:800;color:${esc(p)};text-align:right;font-size:${totalSize}px;">${isBanglaDoc ? 'বকেয়া' : 'Due'}</td>
                  <td style="padding:6px 10px;font-weight:800;text-align:right;font-size:${totalSize}px;">${esc(money(figs.dueAmount))}</td>
                </tr>` : ''}
              </tfoot>
            </table>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:28px;font-family:${footerFont};font-size:${fSize}px;font-weight:600;">
            <div style="border-top:1px solid #64748B;padding-top:4px;min-width:125px;text-align:center;">${esc(config.customerSignLabel)}</div>
            <div style="font-size:${Math.max(12, fSize + 2)}px;font-weight:700;color:${esc(p)};font-style:italic;">${esc(config.footerNote || 'Thank You, Come Again')}</div>
            <div style="border-top:1px solid #64748B;padding-top:4px;min-width:125px;text-align:center;">${esc(config.authorizedSignLabel)}</div>
          </div>
        </div>
        <div style="height:10px;background:linear-gradient(90deg, ${esc(p)}, ${esc(a)}, ${esc(p)});"></div>
      </div>
    `;
  }

  // =========================================================================
  // TEMPLATE 6: SUNSET EMBER & ONYX (Screenshot 6)
  // =========================================================================
  if (templateId === 'sunset-ember') {
    const p = config.primaryColor; // orange
    const a = config.accentColor; // crimson
    const th = config.tableHeaderColor;
    const tint = config.paperTint;
    return `
      <div style="${outerStyle}background:#FFFFFF;">
        <div style="display:flex;background:#0F172A;min-height:112px;border-bottom:5px solid ${esc(p)};font-family:${headerFont};">
          <div style="width:57%;background:#FFFFFF;padding:14px 24px 14px 22px;clip-path:polygon(0 0, 92% 0, 100% 100%, 0 100%);display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;">
            <span style="display:inline-block;background:#0F172A;color:#FFFFFF;padding:3px 20px;border-radius:999px;font-size:${Math.max(10, hMeta)}px;font-weight:700;margin-bottom:6px;">${esc(config.memoTitle)}</span>
            <div style="font-family:${headerFont};font-size:${hTitle}px;font-weight:900;color:${esc(a)};line-height:1.15;">${esc(config.businessName)}</div>
            ${config.slogan ? `<div style="font-size:${hMeta}px;font-weight:600;color:${esc(p)};margin-top:3px;">${esc(config.slogan)}</div>` : ''}
          </div>
          <div style="width:43%;padding:14px 20px;color:#FDE68A;display:flex;flex-direction:column;justify-content:center;gap:5px;font-size:${hMeta}px;font-weight:600;">
            ${config.address ? `<div>● ${esc(config.address.slice(0, 44))}</div>` : ''}
            ${config.website ? `<div>● ${esc(config.website)}</div>` : ''}
            ${config.email ? `<div>● ${esc(config.email)}</div>` : ''}
            ${config.phone ? `<div>● ${esc(config.phone)}</div>` : ''}
          </div>
        </div>

        <div style="padding:14px 24px 18px;">
          <div style="font-family:${bodyFont};font-size:${bSize}px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div>
                <strong>${isBanglaDoc ? 'নং:' : 'No:'}</strong> <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;">${esc(invoice.invoiceNumber)}</span>
                ${vatMetaBar}
              </div>
              <div style="display:flex;align-items:stretch;border:1px solid #0F172A;">
                <span style="background:#0F172A;color:#FFFFFF;padding:3px 10px;font-weight:700;font-size:${Math.max(9, bSize - 1)}px;">${isBanglaDoc ? 'তারিখ:' : 'Date:'}</span>
                <span style="padding:3px 10px;border-right:1px solid #64748B;font-family:'IBM Plex Mono',monospace;">${esc(dd)}</span>
                <span style="padding:3px 10px;border-right:1px solid #64748B;font-family:'IBM Plex Mono',monospace;">${esc(mm)}</span>
                <span style="padding:3px 10px;font-family:'IBM Plex Mono',monospace;">${esc(yyyy)}</span>
              </div>
            </div>

            <div style="display:flex;margin-bottom:6px;border:1px solid #334155;border-radius:4px;overflow:hidden;">
              <div style="width:86px;background:#0F172A;color:#FFFFFF;font-size:${Math.max(9, bSize - 1)}px;font-weight:700;padding:4px 8px;text-align:center;">${isBanglaDoc ? 'নাম:' : 'Name:'}</div>
              <div style="flex:1;padding:4px 10px;font-weight:600;">${esc(invoice.customerName)}</div>
            </div>
            <div style="display:flex;margin-bottom:12px;border:1px solid #334155;border-radius:4px;overflow:hidden;">
              <div style="width:86px;background:#0F172A;color:#FFFFFF;font-size:${Math.max(9, bSize - 1)}px;font-weight:700;padding:4px 8px;text-align:center;">${isBanglaDoc ? 'ঠিকানা:' : 'Address:'}</div>
              <div style="flex:1;padding:4px 10px;">${esc(invoice.customerAddress || invoice.customerPhone || '—')}</div>
            </div>
          </div>

          <div style="border:1.5px solid #475569;position:relative;">
            ${watermarkHtml}
            <table style="width:100%;border-collapse:collapse;position:relative;z-index:1;font-family:${tableFont};">
              <thead>
                <tr style="background:linear-gradient(90deg, ${esc(th)} 0%, ${esc(a)} 100%);color:#FFFFFF;font-family:${tableFont};font-size:${thSize}px;">
                  <th style="padding:7px 6px;width:54px;border-right:1px solid rgba(255,255,255,0.3);">${esc(config.colSl)}</th>
                  <th style="padding:7px 10px;text-align:left;border-right:1px solid rgba(255,255,255,0.3);">${esc(config.colDesc)}</th>
                  <th style="padding:7px 8px;width:82px;border-right:1px solid rgba(255,255,255,0.3);">${esc(config.colQty)}</th>
                  <th style="padding:7px 8px;width:96px;border-right:1px solid rgba(255,255,255,0.3);text-align:right;">${esc(config.colRate)}</th>
                  <th style="padding:7px 10px;width:118px;text-align:right;">${esc(config.colAmount)}</th>
                </tr>
              </thead>
              <tbody>
                ${buildStandardRows('#94A3B8', { qtyBg: tint, amtBg: tint })}
              </tbody>
              <tfoot style="font-family:${tableFont};font-size:${tdSize}px;">
                ${includeVat ? `
                <tr>
                  <td colspan="3" style="border-right:1px solid #94A3B8;"></td>
                  <td style="padding:6px 10px;border-right:1px solid #94A3B8;border-bottom:1px solid #94A3B8;font-weight:700;color:${esc(p)};text-align:right;">${isBanglaDoc ? 'মূসক (VAT)' : 'VAT'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid #94A3B8;font-weight:700;text-align:right;background:${esc(tint)};">${esc(money(figs.vatTotal))}</td>
                </tr>` : ''}
                <tr>
                  <td colspan="3" style="border-right:1px solid #94A3B8;padding:6px 10px;font-family:${footerFont};font-size:${fSize}px;color:#475569;">${config.footerNote ? esc(config.footerNote) : ''}</td>
                  <td style="padding:6px 10px;border-right:1px solid #94A3B8;border-bottom:1px solid #94A3B8;font-weight:800;color:${esc(p)};text-align:right;font-size:${totalSize}px;">${isBanglaDoc ? 'সর্বমোট' : 'Total'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid #94A3B8;font-weight:800;text-align:right;font-size:${totalSize}px;background:${esc(tint)};">${esc(money(figs.payableTotal))}</td>
                </tr>
                ${config.showAdvanceAndDue ? `
                <tr>
                  <td colspan="3" style="border-right:1px solid #94A3B8;"></td>
                  <td style="padding:6px 10px;border-right:1px solid #94A3B8;border-bottom:1px solid #94A3B8;font-weight:700;color:${esc(p)};text-align:right;">${isBanglaDoc ? 'জমা' : 'Advance'}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid #94A3B8;font-weight:700;text-align:right;background:${esc(tint)};">${esc(money(figs.paidAmount))}</td>
                </tr>
                <tr>
                  <td colspan="3" style="border-right:1px solid #94A3B8;"></td>
                  <td style="padding:6px 10px;border-right:1px solid #94A3B8;font-weight:800;color:${esc(p)};text-align:right;">${isBanglaDoc ? 'বকেয়া' : 'Due'}</td>
                  <td style="padding:6px 10px;font-weight:800;text-align:right;background:${esc(tint)};">${esc(money(figs.dueAmount))}</td>
                </tr>` : ''}
              </tfoot>
            </table>
          </div>

          <div style="font-family:${footerFont};font-size:${fSize}px;">
            ${config.showAmountInWords ? `<div style="margin-top:10px;display:flex;gap:6px;"><strong style="white-space:nowrap;">${isBanglaDoc ? 'টাকা (কথায়):' : 'Taka (In word):'}</strong><span style="flex:1;border-bottom:1px dotted #475569;padding-left:4px;">${esc(words)}</span></div>` : ''}

            <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:28px;font-weight:600;">
              <div style="border-top:1px dotted #475569;padding-top:4px;min-width:125px;text-align:center;">${esc(config.customerSignLabel)}</div>
              <div style="border-top:1px dotted #475569;padding-top:4px;min-width:125px;text-align:center;">${esc(config.authorizedSignLabel)}</div>
            </div>
          </div>
        </div>
        <div style="height:12px;background:linear-gradient(90deg, #F59E0B, ${esc(p)}, ${esc(a)});"></div>
      </div>
    `;
  }

  // =========================================================================
  // TEMPLATE 7: HERITAGE BANGLA ENTERPRISE (Screenshot 7)
  // =========================================================================
  const p = config.primaryColor; // royal blue
  const a = config.accentColor; // green
  const th = config.tableHeaderColor;
  const tint = config.paperTint;
  return `
    <div style="${outerStyle}background:${esc(tint)};">
      <div style="background:linear-gradient(180deg, #FEF08A 0%, #FEFCE8 100%);padding:12px 44px 10px 20px;position:relative;border-left:10px solid ${esc(p)};font-family:${headerFont};">
        <div style="position:absolute;top:0;right:0;background:#DC2626;color:#FFFFFF;padding:12px 7px;writing-mode:vertical-rl;font-size:${hMeta}px;font-weight:800;letter-spacing:0.06em;border-bottom-left-radius:8px;">
          ${esc(config.memoTitle)}
        </div>
        ${config.showInvocation ? `<div style="text-align:center;font-size:${hMeta}px;font-weight:600;color:#1E293B;margin-bottom:4px;">${esc(config.invocationText)}</div>` : ''}
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
          ${config.showLogo ? safeLogoHtml(org, '#F97316', 48) : ''}
          <div style="text-align:center;">
            <div style="font-family:${headerFont};font-size:${hTitle}px;font-weight:900;color:${esc(p)};line-height:1.15;">${esc(config.businessName)}</div>
            ${config.proprietorLabel ? `<div style="display:inline-block;background:${esc(p)};color:#FFFFFF;padding:2px 22px;border-radius:999px;font-size:${hMeta}px;font-weight:700;margin-top:5px;">${esc(config.proprietorLabel)}</div>` : ''}
          </div>
        </div>
        ${config.phone ? `<div style="text-align:center;font-size:${hMeta}px;font-weight:800;color:#DC2626;margin-top:5px;">মোবাঃ ${esc(config.phone)}</div>` : ''}
        ${config.businessDescription ? `<div style="text-align:center;font-size:${hMeta}px;color:#0F172A;margin-top:3px;font-weight:500;">${esc(config.businessDescription)}</div>` : ''}
        ${vatMetaBar ? `<div style="text-align:center;">${vatMetaBar}</div>` : ''}
      </div>

      <div style="background:${esc(a)};color:#FEF08A;text-align:center;padding:5px 16px;font-family:${headerFont};font-size:${Math.max(11, hMeta + 1)}px;font-weight:800;">
        ${esc(config.address)}
      </div>

      <div style="padding:12px 22px 14px;">
        <div style="font-family:${bodyFont};font-size:${bSize}px;line-height:1.85;margin-bottom:10px;">
          <div style="display:flex;gap:16px;">
            <div style="flex:1;display:flex;gap:6px;">
              <strong>তারিখঃ</strong>
              <span style="flex:1;border-bottom:1px dotted #475569;padding-left:6px;font-weight:600;">${esc(formatDate(invoice.issueDate, 'bn'))}</span>
            </div>
            <div style="flex:1;display:flex;gap:6px;">
              <strong>ক্রমিক নংঃ</strong>
              <span style="flex:1;border-bottom:1px dotted #475569;padding-left:6px;font-family:'IBM Plex Mono',monospace;font-weight:700;">${esc(invoice.invoiceNumber)}</span>
            </div>
          </div>
          <div style="display:flex;gap:16px;">
            <div style="flex:1;display:flex;gap:6px;">
              <strong>নামঃ</strong>
              <span style="flex:1;border-bottom:1px dotted #475569;padding-left:6px;font-weight:600;">${esc(invoice.customerName)}</span>
            </div>
            <div style="flex:1;display:flex;gap:6px;">
              <strong>মোবাঃ</strong>
              <span style="flex:1;border-bottom:1px dotted #475569;padding-left:6px;">${esc(invoice.customerPhone || '—')}</span>
            </div>
          </div>
          <div style="display:flex;gap:6px;">
            <strong>ঠিকানাঃ</strong>
            <span style="flex:1;border-bottom:1px dotted #475569;padding-left:6px;">${esc(invoice.customerAddress || '—')}</span>
          </div>
        </div>

        <div style="border:1.5px solid ${esc(a)};background:#FFFFFF;position:relative;">
          ${watermarkHtml}
          <table style="width:100%;border-collapse:collapse;position:relative;z-index:1;font-family:${tableFont};">
            <thead>
              <tr style="color:#FFFFFF;font-family:${tableFont};font-size:${thSize}px;">
                <th style="padding:7px 6px;width:54px;background:#DB2777;border-right:1px solid #FFFFFF;">${esc(config.colSl)}</th>
                <th style="padding:7px 10px;text-align:left;background:${esc(th)};border-right:1px solid #FFFFFF;">${esc(config.colDesc)}</th>
                <th style="padding:7px 8px;width:80px;background:#DC2626;border-right:1px solid #FFFFFF;">${esc(config.colQty)}</th>
                <th style="padding:7px 8px;width:96px;background:#BE185D;border-right:1px solid #FFFFFF;text-align:right;">${esc(config.colRate)}</th>
                <th style="padding:7px 10px;width:118px;background:${esc(a)};text-align:right;">${esc(config.colAmount)}</th>
              </tr>
            </thead>
            <tbody>
              ${buildStandardRows('#86EFAC', { horizontalBorders: false })}
            </tbody>
            <tfoot style="font-family:${tableFont};font-size:${tdSize}px;">
              ${includeVat ? `
              <tr style="border-top:1px solid ${esc(a)};">
                <td colspan="3" style="border-right:1px solid ${esc(a)};"></td>
                <td style="padding:5px 8px;background:#0F766E;color:#FFFFFF;font-weight:700;text-align:center;border-bottom:1px solid #FFFFFF;">মূসক =</td>
                <td style="padding:5px 10px;background:#F0FDF4;font-weight:700;text-align:right;border-bottom:1px solid ${esc(a)};">${esc(money(figs.vatTotal))}</td>
              </tr>` : ''}
              <tr style="border-top:1px solid ${esc(a)};">
                <td colspan="3" style="border-right:1px solid ${esc(a)};"></td>
                <td style="padding:5px 8px;background:#DB2777;color:#FFFFFF;font-weight:700;text-align:center;border-bottom:1px solid #FFFFFF;">সর্বমোট =</td>
                <td style="padding:5px 10px;background:#F0FDF4;font-weight:800;text-align:right;font-size:${totalSize}px;border-bottom:1px solid ${esc(a)};">${esc(money(figs.payableTotal))}</td>
              </tr>
              ${config.showAdvanceAndDue ? `
              <tr>
                <td colspan="3" style="border-right:1px solid ${esc(a)};"></td>
                <td style="padding:5px 8px;background:#BE185D;color:#FFFFFF;font-weight:700;text-align:center;border-bottom:1px solid #FFFFFF;">জমা =</td>
                <td style="padding:5px 10px;background:#F0FDF4;font-weight:700;text-align:right;border-bottom:1px solid ${esc(a)};">${esc(money(figs.paidAmount))}</td>
              </tr>
              <tr>
                <td colspan="3" style="border-right:1px solid ${esc(a)};"></td>
                <td style="padding:5px 8px;background:${esc(a)};color:#FFFFFF;font-weight:700;text-align:center;">জের =</td>
                <td style="padding:5px 10px;background:#F0FDF4;font-weight:800;text-align:right;font-size:${totalSize}px;">${esc(money(figs.dueAmount))}</td>
              </tr>` : ''}
            </tfoot>
          </table>
        </div>

        ${config.showAmountInWords ? `<div style="margin-top:10px;font-family:${footerFont};font-size:${fSize}px;display:flex;gap:6px;"><strong style="white-space:nowrap;">কথায়ঃ</strong><span style="flex:1;border-bottom:1px dotted #475569;padding-left:4px;">${esc(words)}</span></div>` : ''}
      </div>

      <div style="display:flex;align-items:stretch;font-family:${footerFont};font-size:${fSize}px;font-weight:700;color:#FFFFFF;margin-top:6px;">
        <div style="width:140px;background:#0284C7;padding:7px 12px;text-align:center;">${esc(config.customerSignLabel)}</div>
        <div style="flex:1;background:#3730A3;padding:7px 12px;text-align:center;border-left:2px solid #FFFFFF;border-right:2px solid #FFFFFF;">${esc(config.footerNote || 'বিঃ দ্রঃ বিক্রিত মাল ফেরত লওয়া হয় না।')}</div>
        <div style="width:140px;background:#0284C7;padding:7px 12px;text-align:center;">${esc(config.authorizedSignLabel)}</div>
      </div>
    </div>
  `;
}

/**
 * Generates an authentic 80mm or 58mm POS Thermal Terminal Receipt document
 * for direct thermal printer output via hidden print iframe.
 */
export function renderThermalReceiptHtml(
  invoice: Invoice,
  org: Organization,
  lang: Language,
  options: { includeVat?: boolean; paperWidth?: ThermalPaperWidth; settings?: CashMemoSettings } = {},
): string {
  const { config, thermalPaperWidth } = resolveCashMemoConfig(
    options.settings ?? org.cashMemoSettings,
    undefined,
    org,
    lang,
  );
  const paperWidth = options.paperWidth ?? thermalPaperWidth;
  const includeVat = options.includeVat ?? config.defaultIncludeVat;
  const isBn = lang === 'bn';
  const money = (v: number) => formatMoney(v, lang, org.currencySymbol);
  const figs = computeCashMemoFigures(invoice, includeVat);
  const widthCss = paperWidth === '58mm' ? '54mm' : '74mm';

  const headerFont = CASH_MEMO_FONTS[config.headerFontFamily]?.css || CASH_MEMO_FONTS['noto-sans'].css;
  const bodyFont = CASH_MEMO_FONTS[config.bodyFontFamily]?.css || CASH_MEMO_FONTS['noto-sans'].css;
  const tableFont = CASH_MEMO_FONTS[config.tableFontFamily]?.css || CASH_MEMO_FONTS['noto-sans'].css;
  const footerFont = CASH_MEMO_FONTS[config.footerFontFamily]?.css || CASH_MEMO_FONTS['noto-sans'].css;

  const thermalTitleSize = Math.max(11, Math.min(18, Math.round(config.headerTitleSize * 0.55)));
  const thermalMetaSize = Math.max(8, Math.min(12, config.headerMetaSize - 2));
  const thermalBodySize = Math.max(9, Math.min(13, config.bodyFontSize - 1));
  const thermalItemSize = Math.max(9, Math.min(13, config.tableCellSize - 1));
  const thermalFooterSize = Math.max(8, Math.min(12, config.footerFontSize - 2));

  const itemsHtml = figs.items
    .map(
      (item) => `
      <div style="margin-bottom:5px;font-family:${tableFont};font-size:${thermalItemSize}px;">
        <div style="font-weight:600;word-break:break-word;">${esc(item.description)}</div>
        <div style="display:flex;justify-content:space-between;font-size:${Math.max(8, thermalItemSize - 1)}px;color:#111;">
          <span>${esc(formatNumber(item.quantity, lang))} × ${esc(money(item.rate))}${includeVat && item.vatRate > 0 ? ` (+${esc(formatNumber(item.vatRate, lang))}% VAT)` : ''}</span>
          <span style="font-weight:700;">${esc(money(item.amount))}</span>
        </div>
      </div>
    `,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="${isBn ? 'bn' : 'en'}">
<head>
  <meta charset="utf-8" />
  <title>${esc(invoice.invoiceNumber)} - Terminal Receipt</title>
  <style>
    @page { size: ${paperWidth} auto; margin: 2mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 4px;
      width: ${widthCss};
      font-family: ${bodyFont};
      font-size: ${thermalBodySize}px;
      line-height: 1.35;
      color: #000000;
      background: #FFFFFF;
    }
    .hr { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
  </style>
</head>
<body>
  <div style="text-align:center;font-family:${headerFont};">
    ${config.showInvocation ? `<div style="font-size:${thermalMetaSize}px;margin-bottom:2px;">${esc(config.invocationText)}</div>` : ''}
    <div style="font-size:${thermalTitleSize}px;font-weight:800;">${esc(config.businessName)}</div>
    ${config.address ? `<div style="font-size:${thermalMetaSize}px;margin-top:2px;">${esc(config.address)}</div>` : ''}
    ${config.phone ? `<div style="font-size:${thermalMetaSize}px;">${isBn ? 'ফোন' : 'Tel'}: ${esc(config.phone)}</div>` : ''}
    ${includeVat && config.showBinNumber && org.binNumber ? `<div style="font-size:${thermalMetaSize}px;font-weight:700;">BIN: ${esc(org.binNumber)}</div>` : ''}
    <div style="font-size:${Math.max(9, thermalMetaSize + 1)}px;font-weight:700;margin-top:4px;text-transform:uppercase;">${esc(config.memoTitle)}</div>
  </div>
  <div class="hr"></div>
  <div style="font-family:${bodyFont};font-size:${thermalBodySize}px;">
    <div class="row"><span>${isBn ? 'মেমো নং' : 'Memo'}:</span><strong>${esc(invoice.invoiceNumber)}</strong></div>
    <div class="row"><span>${isBn ? 'তারিখ' : 'Date'}:</span><span>${esc(formatDate(invoice.issueDate, lang))}</span></div>
    <div class="row"><span>${isBn ? 'ক্রেতা' : 'Customer'}:</span><span>${esc(invoice.customerName)}</span></div>
    ${includeVat && config.showMushakRef && invoice.mushakChallanNo ? `<div class="row"><span>${isBn ? 'মূসক ৬.৩' : 'Mushak 6.3'}:</span><span>${esc(invoice.mushakChallanNo)}</span></div>` : ''}
  </div>
  <div class="hr"></div>
  <div>${itemsHtml}</div>
  <div class="hr"></div>
  <div style="font-family:${tableFont};font-size:${thermalItemSize}px;">
    <div class="row"><span>${isBn ? 'উপ-মোট' : 'Subtotal'}</span><span>${esc(money(figs.subtotal))}</span></div>
    ${includeVat ? `<div class="row"><span>${isBn ? 'মূসক (VAT)' : 'VAT'}</span><span>${esc(money(figs.vatTotal))}</span></div>` : ''}
    <div class="hr"></div>
    <div class="row" style="font-size:${thermalItemSize + 2}px;font-weight:800;"><span>${isBn ? 'সর্বমোট' : 'TOTAL'}</span><span>${esc(money(figs.payableTotal))}</span></div>
    ${config.showAdvanceAndDue ? `
      <div class="row" style="font-size:${Math.max(9, thermalItemSize - 1)}px;margin-top:2px;"><span>${isBn ? 'পরিশোধিত' : 'PAID'}</span><span>${esc(money(figs.paidAmount))}</span></div>
      ${figs.dueAmount > 0 ? `<div class="row" style="font-size:${Math.max(9, thermalItemSize - 1)}px;font-weight:700;"><span>${isBn ? 'বকেয়া' : 'DUE'}</span><span>${esc(money(figs.dueAmount))}</span></div>` : ''}
    ` : ''}
  </div>
  <div class="hr"></div>
  <div style="text-align:center;font-family:${footerFont};font-size:${thermalFooterSize}px;">
    <div>${esc(config.footerNote || (isBn ? 'ধন্যবাদ · আবার আসবেন' : 'Thank you · Come again'))}</div>
    <div style="margin-top:2px;">${includeVat ? (isBn ? 'মূসক সহ রসিদ' : 'VAT Inclusive Receipt') : (isBn ? 'ক্যাশ মেমো (মূসক ছাড়া)' : 'Cash Memo (No VAT)')}</div>
  </div>
</body>
</html>`;
}
