import type { Language } from './types';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBanglaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

/**
 * Formats numbers using South Asian (BD/IN) comma grouping (e.g. 1,25,450.00) with optional Bengali numerals.
 */
export function formatMoney(
  amount: number,
  lang: Language = 'en',
  currencySymbol = '৳',
  showDecimals = true
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const fixed = showDecimals ? abs.toFixed(2) : Math.round(abs).toString();
  const [intPart, decPart] = fixed.split('.');

  let grouped = intPart;
  if (intPart.length > 3) {
    const lastThree = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${lastThree}`;
  }

  const formattedNumber = decPart !== undefined ? `${grouped}.${decPart}` : grouped;
  const localized = lang === 'bn' ? toBanglaDigits(formattedNumber) : formattedNumber;
  return `${negative ? '-' : ''}${currencySymbol}${localized}`;
}

export function formatNumber(value: number, lang: Language = 'en'): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return lang === 'bn' ? toBanglaDigits(formatted) : formatted;
}

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BN_MONTHS = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];

export function formatDate(isoDate: string | null | undefined, lang: Language = 'en'): string {
  if (!isoDate) return '—';
  const clean = isoDate.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return isoDate;
  const monthName = lang === 'bn' ? BN_MONTHS[m - 1] : EN_MONTHS[m - 1];
  const dayStr = lang === 'bn' ? toBanglaDigits(d) : String(d).padStart(2, '0');
  const yearStr = lang === 'bn' ? toBanglaDigits(y) : String(y);
  return `${dayStr} ${monthName} ${yearStr}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
