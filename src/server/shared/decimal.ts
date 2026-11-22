import Decimal from 'decimal.js';

// Configure Decimal.js for high-precision financial calculation
Decimal.set({
  precision: 34,
  rounding: Decimal.ROUND_HALF_UP,
});

export const MONEY_SCALE = 6;
export const DISPLAY_CURRENCY_SCALE = 2;

const DECIMAL_STRING_REGEX = /^-?\d+(\.\d{1,6})?$/;

export function isValidMoneyString(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  if (!DECIMAL_STRING_REGEX.test(val)) return false;
  try {
    const d = new Decimal(val);
    return d.isFinite();
  } catch {
    return false;
  }
}

export function toMoneyString(val: string | Decimal): string {
  const d = val instanceof Decimal ? val : new Decimal(val);
  return d.toFixed(MONEY_SCALE);
}

export function addMoney(a: string, b: string): string {
  return new Decimal(a).plus(new Decimal(b)).toFixed(MONEY_SCALE);
}

export function subtractMoney(a: string, b: string): string {
  return new Decimal(a).minus(new Decimal(b)).toFixed(MONEY_SCALE);
}

export function compareMoney(a: string, b: string): number {
  return new Decimal(a).comparedTo(new Decimal(b));
}

export function verifyBalancedJournalLines(
  lines: ReadonlyArray<{ debit: string; credit: string }>
): { balanced: boolean; totalDebit: string; totalCredit: string } {
  let debitSum = new Decimal(0);
  let creditSum = new Decimal(0);

  for (const line of lines) {
    const d = new Decimal(line.debit);
    const c = new Decimal(line.credit);
    if (d.isNegative() || c.isNegative()) {
      return {
        balanced: false,
        totalDebit: debitSum.toFixed(MONEY_SCALE),
        totalCredit: creditSum.toFixed(MONEY_SCALE),
      };
    }
    const hasDebit = d.greaterThan(0) && c.isZero();
    const hasCredit = c.greaterThan(0) && d.isZero();
    if (!hasDebit && !hasCredit) {
      return {
        balanced: false,
        totalDebit: debitSum.toFixed(MONEY_SCALE),
        totalCredit: creditSum.toFixed(MONEY_SCALE),
      };
    }
    debitSum = debitSum.plus(d);
    creditSum = creditSum.plus(c);
  }

  const balanced = debitSum.greaterThan(0) && debitSum.equals(creditSum);
  return {
    balanced,
    totalDebit: debitSum.toFixed(MONEY_SCALE),
    totalCredit: creditSum.toFixed(MONEY_SCALE),
  };
}
