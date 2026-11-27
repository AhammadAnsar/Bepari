import { roundMoney } from './accounting';
import type { TaxMode, TaxRule } from './types';

/**
 * Resolves the active versioned tax rule valid for a given transaction date (YYYY-MM-DD).
 */
export function resolveActiveTaxRule(
  rules: TaxRule[],
  ruleId: number | null | undefined,
  transactionDate: string
): TaxRule | null {
  const activeOnDate = rules.filter((r) => {
    if (!r.isActive) return false;
    if (r.effectiveFrom > transactionDate) return false;
    if (r.effectiveTo && r.effectiveTo < transactionDate) return false;
    return true;
  });

  if (ruleId != null) {
    const exact = activeOnDate.find((r) => r.id === ruleId);
    if (exact) return exact;
    const fallbackById = rules.find((r) => r.id === ruleId);
    if (fallbackById) return fallbackById;
  }

  return activeOnDate.find((r) => r.isDefault) || activeOnDate[0] || null;
}

export interface LineTaxCalculation {
  taxableValue: number;
  sdAmount: number;
  vatAmount: number;
  lineTotal: number;
}

/**
 * Calculates Bangladesh NBR VAT & Supplementary Duty (SD) for a single line item.
 * - Exclusive: VAT is added on top of (Taxable Base + SD).
 * - Inclusive: Gross total already includes VAT + SD; extracts taxable base accurately.
 */
export function calculateLineTax(params: {
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  vatRate: number;
  sdRate?: number;
  mode?: TaxMode;
}): LineTaxCalculation {
  const quantity = Number(params.quantity) || 0;
  const unitPrice = Number(params.unitPrice) || 0;
  const discount = Math.max(0, Number(params.discountAmount) || 0);
  const vatRate = Math.max(0, Number(params.vatRate) || 0);
  const sdRate = Math.max(0, Number(params.sdRate) || 0);
  const mode: TaxMode = params.mode || 'exclusive';

  const grossBeforeTax = Math.max(0, roundMoney(quantity * unitPrice - discount));

  if (mode === 'inclusive') {
    const combinedFactor = (1 + sdRate / 100) * (1 + vatRate / 100);
    const taxableValue = combinedFactor > 0 ? roundMoney(grossBeforeTax / combinedFactor) : grossBeforeTax;
    const sdAmount = roundMoney(taxableValue * (sdRate / 100));
    const vatBase = roundMoney(taxableValue + sdAmount);
    const vatAmount = roundMoney(grossBeforeTax - vatBase);
    return {
      taxableValue,
      sdAmount,
      vatAmount,
      lineTotal: grossBeforeTax,
    };
  }

  const taxableValue = grossBeforeTax;
  const sdAmount = roundMoney(taxableValue * (sdRate / 100));
  const vatBase = roundMoney(taxableValue + sdAmount);
  const vatAmount = roundMoney(vatBase * (vatRate / 100));
  const lineTotal = roundMoney(taxableValue + sdAmount + vatAmount);

  return {
    taxableValue,
    sdAmount,
    vatAmount,
    lineTotal,
  };
}

/**
 * Formats an official Mushak 6.3 challan serial number.
 */
export function formatMushakChallanNo(prefix: string, branchCode: string, seq: number, year: number): string {
  const padded = String(seq).padStart(5, '0');
  return `${prefix}-${branchCode}-${year}-${padded}`;
}
