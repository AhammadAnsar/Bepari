import { formatMoney } from '../engine/format';
import type { Language } from '../engine/types';

export type MfsQrProvider = 'bkash' | 'nagad' | 'rocket';

export interface MfsProviderMeta {
  id: MfsQrProvider;
  labelEn: string;
  labelBn: string;
  gatewayName: string;
  prefix: string;
  guid: string;
  tagId: string;
  brandHex: string;
  softBgClass: string;
  borderClass: string;
  textClass: string;
  hintEn: string;
  hintBn: string;
}

export const MFS_QR_PROVIDERS: Record<MfsQrProvider, MfsProviderMeta> = {
  bkash: {
    id: 'bkash',
    labelEn: 'bKash',
    labelBn: 'বিকাশ',
    gatewayName: 'bKash Merchant',
    prefix: 'BKS',
    guid: 'com.bkash.merchant',
    tagId: '26',
    brandHex: '#D12053',
    softBgClass: 'bg-[#D12053]/10',
    borderClass: 'border-[#D12053]/30',
    textClass: 'text-[#B91C4B]',
    hintEn: 'Scan from bKash App → Make Payment',
    hintBn: 'বিকাশ অ্যাপ → পেমেন্ট থেকে স্ক্যান করুন',
  },
  nagad: {
    id: 'nagad',
    labelEn: 'Nagad',
    labelBn: 'নগদ',
    gatewayName: 'Nagad Merchant',
    prefix: 'NGD',
    guid: 'com.nagad.merchant',
    tagId: '27',
    brandHex: '#E11D2E',
    softBgClass: 'bg-[#E11D2E]/10',
    borderClass: 'border-[#E11D2E]/30',
    textClass: 'text-[#C81928]',
    hintEn: 'Scan from Nagad App → Merchant Pay',
    hintBn: 'নগদ অ্যাপ → মার্চেন্ট পে থেকে স্ক্যান করুন',
  },
  rocket: {
    id: 'rocket',
    labelEn: 'Rocket',
    labelBn: 'রকেট',
    gatewayName: 'DBBL Rocket Merchant',
    prefix: 'RKT',
    guid: 'com.dbbl.rocket',
    tagId: '28',
    brandHex: '#8C3494',
    softBgClass: 'bg-[#8C3494]/10',
    borderClass: 'border-[#8C3494]/30',
    textClass: 'text-[#7A2982]',
    hintEn: 'Scan from Rocket App → Merchant Pay',
    hintBn: 'রকেট অ্যাপ → মার্চেন্ট পে থেকে স্ক্যান করুন',
  },
};

export interface MfsQrInput {
  provider: MfsQrProvider;
  merchantWallet: string;
  merchantName: string;
  merchantCity?: string;
  amount: number;
  invoiceNumber?: string;
  reference: string;
  customerName?: string;
}

export interface MfsQrPayloadResult {
  provider: MfsQrProvider;
  meta: MfsProviderMeta;
  merchantWallet: string;
  formattedWallet: string;
  amount: number;
  formattedAmount: string;
  invoiceNumber: string;
  reference: string;
  payload: string;
  crc: string;
}

/**
 * Normalizes a Bangladesh MFS mobile/merchant account number.
 * Accepts +8801XXXXXXXXX, 8801XXXXXXXXX, 01XXXXXXXXX, or 12-digit Rocket accounts (01XXXXXXXXX + check digit).
 */
export function normalizeBdMfsNumber(raw: string, provider: MfsQrProvider): string {
  let digits = (raw || '').replace(/\D+/g, '');
  if (digits.startsWith('880') && digits.length >= 13) {
    digits = digits.slice(2);
  }
  if (provider === 'rocket') {
    if (digits.length > 12) digits = digits.slice(0, 12);
    return digits;
  }
  if (digits.length > 11) digits = digits.slice(0, 11);
  return digits;
}

export function isValidBdMfsNumber(normalized: string, provider: MfsQrProvider): boolean {
  if (!/^01[3-9]\d{8,9}$/.test(normalized)) return false;
  if (provider === 'rocket') {
    return normalized.length === 11 || normalized.length === 12;
  }
  return normalized.length === 11;
}

export function formatBdWalletDisplay(normalized: string): string {
  if (normalized.length === 11) {
    return `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
  }
  if (normalized.length === 12) {
    return `${normalized.slice(0, 5)}-${normalized.slice(5, 11)}-${normalized.slice(11)}`;
  }
  return normalized;
}

function toAsciiClean(input: string, maxLen: number, fallback: string): string {
  const cleaned = (input || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = cleaned || fallback;
  return base.slice(0, maxLen);
}

function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * Standard ISO/IEC 13239 CRC-16/CCITT-FALSE used by EMVCo Merchant-Presented QR (BanglaQR).
 * Polynomial: 0x1021, Initial Value: 0xFFFF.
 */
export function computeCrc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function generateMfsCollectionRef(provider: MfsQrProvider, invoiceNumber?: string): string {
  const prefix = MFS_QR_PROVIDERS[provider].prefix;
  const invDigits = (invoiceNumber || '').replace(/[^A-Z0-9]/gi, '').slice(-5).toUpperCase();
  const suffix = String(Date.now()).slice(-4);
  return invDigits ? `${prefix}-${invDigits}-${suffix}` : `${prefix}-${suffix}${Math.floor(10 + Math.random() * 89)}`;
}

/**
 * Builds a dynamic EMVCo / BanglaQR Merchant-Presented QR payload with embedded BDT amount,
 * provider merchant account info, invoice reference, and valid CRC-16/CCITT checksum.
 */
export function buildMfsPaymentQrPayload(input: MfsQrInput): MfsQrPayloadResult {
  const meta = MFS_QR_PROVIDERS[input.provider];
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than zero to generate a QR code.');
  }

  const normalizedWallet = normalizeBdMfsNumber(input.merchantWallet, input.provider);
  if (!isValidBdMfsNumber(normalizedWallet, input.provider)) {
    throw new Error('Please enter a valid Bangladesh 11-digit MFS merchant number (e.g. 017XXXXXXXX).');
  }

  const formattedAmount = amount.toFixed(2);
  const merchantName = toAsciiClean(input.merchantName, 25, 'BEPARI MERCHANT');
  const merchantCity = toAsciiClean(input.merchantCity || 'DHAKA', 15, 'DHAKA');
  const invoiceNumber = toAsciiClean(input.invoiceNumber || '', 20, 'DIRECT');
  const reference = toAsciiClean(input.reference, 20, `${meta.prefix}PAY`);
  const purpose = toAsciiClean(input.customerName || 'Invoice Payment', 25, 'Invoice Payment');

  // Tag 26/27/28: Merchant Account Information (BanglaQR MFS template)
  const merchantAccountTemplate = [
    tlv('00', meta.guid),
    tlv('01', normalizedWallet),
    tlv('02', meta.prefix),
  ].join('');

  // Tag 62: Additional Data Field Template (Bill Number + Reference Label + Purpose)
  const additionalDataTemplate = [
    tlv('01', invoiceNumber),
    tlv('05', reference),
    tlv('08', purpose),
  ].join('');

  const bodyWithoutCrc = [
    tlv('00', '01'), // Payload Format Indicator
    tlv('01', '12'), // Dynamic QR (Point of Initiation Method = 12)
    tlv(meta.tagId, merchantAccountTemplate),
    tlv('52', '5999'), // Merchant Category Code
    tlv('53', '050'), // Currency Code: 050 = BDT
    tlv('54', formattedAmount), // Dynamic Transaction Amount
    tlv('58', 'BD'), // Country Code: Bangladesh
    tlv('59', merchantName),
    tlv('60', merchantCity),
    tlv('62', additionalDataTemplate),
    '6304', // CRC Tag + Length (04)
  ].join('');

  const crc = computeCrc16Ccitt(bodyWithoutCrc);
  const payload = `${bodyWithoutCrc}${crc}`;

  return {
    provider: input.provider,
    meta,
    merchantWallet: normalizedWallet,
    formattedWallet: formatBdWalletDisplay(normalizedWallet),
    amount,
    formattedAmount,
    invoiceNumber,
    reference,
    payload,
    crc,
  };
}

export function formatShareablePaymentText(
  result: MfsQrPayloadResult,
  orgDisplayName: string,
  currencySymbol: string,
  lang: Language,
): string {
  const moneyStr = formatMoney(result.amount, lang, currencySymbol);
  if (lang === 'bn') {
    return [
      `${orgDisplayName} — ${result.meta.labelBn} পেমেন্ট অনুরোধ`,
      `পরিমাণ: ${moneyStr}`,
      `${result.meta.labelBn} মার্চেন্ট নম্বর: ${result.formattedWallet}`,
      result.invoiceNumber !== 'DIRECT' ? `ইনভয়েস নং: ${result.invoiceNumber}` : null,
      `রেফারেন্স: ${result.reference}`,
      `পেমেন্ট শেষে TrxID আমাদের সাথে শেয়ার করুন।`,
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    `${orgDisplayName} — ${result.meta.labelEn} Payment Request`,
    `Amount: ${moneyStr}`,
    `${result.meta.labelEn} Merchant Wallet: ${result.formattedWallet}`,
    result.invoiceNumber !== 'DIRECT' ? `Invoice: ${result.invoiceNumber}` : null,
    `Reference: ${result.reference}`,
    `Please share your TrxID once payment is completed.`,
  ]
    .filter(Boolean)
    .join('\n');
}
