import type { Account, AccountType, FinancialReportSummary, JournalLine, TrialBalanceRow } from './types';

/**
 * Exact 2-decimal monetary rounding using integer minor units (paisa) to eliminate IEEE-754 drift.
 */
export function toPaisa(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid monetary amount: ${amount}`);
  }
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromPaisa(paisa: number): number {
  return Math.round(paisa) / 100;
}

export function roundMoney(amount: number): number {
  return fromPaisa(toPaisa(amount));
}

export interface BalancedJournalResult {
  totalDebit: number;
  totalCredit: number;
  lines: JournalLine[];
}

/**
 * Enforces the Double-Entry Accounting invariant:
 * - At least 2 non-zero lines
 * - No negative debit or credit values
 * - Total Debit === Total Credit down to the exact paisa
 */
export function assertJournalBalanced(rawLines: JournalLine[]): BalancedJournalResult {
  const cleaned = rawLines
    .map((line) => ({
      ...line,
      debit: roundMoney(line.debit || 0),
      credit: roundMoney(line.credit || 0),
    }))
    .filter((line) => line.debit !== 0 || line.credit !== 0);

  if (cleaned.length < 2) {
    throw new Error('Double-entry journal requires at least two non-zero lines.');
  }

  let debitPaisa = 0;
  let creditPaisa = 0;

  for (const line of cleaned) {
    if (line.debit < 0 || line.credit < 0) {
      throw new Error(`Negative debit or credit is prohibited on account ${line.accountCode}.`);
    }
    if (line.debit > 0 && line.credit > 0) {
      throw new Error(`Journal line for ${line.accountCode} cannot contain both debit and credit.`);
    }
    debitPaisa += toPaisa(line.debit);
    creditPaisa += toPaisa(line.credit);
  }

  if (debitPaisa !== creditPaisa) {
    throw new Error(
      `Unbalanced double-entry journal: Total Debit (${fromPaisa(debitPaisa)}) != Total Credit (${fromPaisa(creditPaisa)}).`
    );
  }

  return {
    totalDebit: fromPaisa(debitPaisa),
    totalCredit: fromPaisa(creditPaisa),
    lines: cleaned,
  };
}

/**
 * Immutable Ledger Reversal: creates exact contra lines swapping debit and credit.
 */
export function buildReversalLines(originalLines: JournalLine[]): JournalLine[] {
  const reversed = originalLines.map((line) => ({
    accountId: line.accountId,
    accountCode: line.accountCode,
    accountName: line.accountName,
    accountType: line.accountType,
    debit: roundMoney(line.credit || 0),
    credit: roundMoney(line.debit || 0),
    memo: line.memo ? `Reversal: ${line.memo}` : 'Ledger Reversal',
  }));
  return assertJournalBalanced(reversed).lines;
}

export interface PostedLedgerLine {
  accountCode: string;
  accountName: string;
  accountNameBn: string;
  accountType: AccountType;
  debit: number;
  credit: number;
  sourceType: string;
}

/**
 * Generates Trial Balance, P&L, Balance Sheet, and Cash Flow strictly from posted double-entry ledger lines.
 */
export function generateFinancialReports(
  accounts: Account[],
  postedLines: PostedLedgerLine[],
  vatMetrics: {
    taxableSales: number;
    taxablePurchases: number;
    sdPayable: number;
    challanCount: number;
  }
): FinancialReportSummary {
  const map = new Map<
    string,
    { account: Account; debitPaisa: number; creditPaisa: number }
  >();

  for (const acc of accounts) {
    map.set(acc.code, { account: acc, debitPaisa: 0, creditPaisa: 0 });
  }

  let cashInflowPaisa = 0;
  let cashOutflowPaisa = 0;

  for (const line of postedLines) {
    const existing = map.get(line.accountCode);
    const d = toPaisa(line.debit || 0);
    const c = toPaisa(line.credit || 0);
    if (existing) {
      existing.debitPaisa += d;
      existing.creditPaisa += c;
    } else {
      map.set(line.accountCode, {
        account: {
          id: 0,
          code: line.accountCode,
          name: line.accountName,
          nameBn: line.accountNameBn || line.accountName,
          type: line.accountType,
          isSystem: false,
        },
        debitPaisa: d,
        creditPaisa: c,
      });
    }

    // Track cash & bank/MFS accounts (1000, 1010, 1020)
    if (['1000', '1010', '1020'].includes(line.accountCode)) {
      cashInflowPaisa += d;
      cashOutflowPaisa += c;
    }
  }

  const trialRows: TrialBalanceRow[] = [];
  let tbDebitPaisa = 0;
  let tbCreditPaisa = 0;

  const revenueItems: { code: string; name: string; nameBn: string; amount: number }[] = [];
  const expenseItems: { code: string; name: string; nameBn: string; amount: number }[] = [];
  const assetItems: { code: string; name: string; nameBn: string; amount: number }[] = [];
  const liabilityItems: { code: string; name: string; nameBn: string; amount: number }[] = [];
  const equityItems: { code: string; name: string; nameBn: string; amount: number }[] = [];

  let totalRevenuePaisa = 0;
  let totalExpensesPaisa = 0;
  let cogsPaisa = 0;
  let totalAssetsPaisa = 0;
  let totalLiabilitiesPaisa = 0;
  let totalEquityPaisa = 0;

  let outputVatPaisa = 0;
  let inputVatPaisa = 0;

  const sorted = Array.from(map.values()).sort((a, b) =>
    a.account.code.localeCompare(b.account.code)
  );

  for (const entry of sorted) {
    const { account, debitPaisa, creditPaisa } = entry;
    if (debitPaisa === 0 && creditPaisa === 0) continue;

    tbDebitPaisa += debitPaisa;
    tbCreditPaisa += creditPaisa;

    // Normal balance sign
    const isDebitNormal = account.type === 'asset' || account.type === 'expense';
    const netPaisa = isDebitNormal ? debitPaisa - creditPaisa : creditPaisa - debitPaisa;

    trialRows.push({
      accountCode: account.code,
      accountName: account.name,
      accountNameBn: account.nameBn,
      accountType: account.type,
      debit: fromPaisa(debitPaisa),
      credit: fromPaisa(creditPaisa),
      netBalance: fromPaisa(netPaisa),
    });

    if (account.code === '2100') {
      outputVatPaisa = creditPaisa - debitPaisa;
    }
    if (account.code === '1300') {
      inputVatPaisa = debitPaisa - creditPaisa;
    }

    if (account.type === 'revenue') {
      totalRevenuePaisa += netPaisa;
      revenueItems.push({
        code: account.code,
        name: account.name,
        nameBn: account.nameBn,
        amount: fromPaisa(netPaisa),
      });
    } else if (account.type === 'expense') {
      totalExpensesPaisa += netPaisa;
      if (account.code === '5000') {
        cogsPaisa += netPaisa;
      }
      expenseItems.push({
        code: account.code,
        name: account.name,
        nameBn: account.nameBn,
        amount: fromPaisa(netPaisa),
      });
    } else if (account.type === 'asset') {
      totalAssetsPaisa += netPaisa;
      assetItems.push({
        code: account.code,
        name: account.name,
        nameBn: account.nameBn,
        amount: fromPaisa(netPaisa),
      });
    } else if (account.type === 'liability') {
      totalLiabilitiesPaisa += netPaisa;
      liabilityItems.push({
        code: account.code,
        name: account.name,
        nameBn: account.nameBn,
        amount: fromPaisa(netPaisa),
      });
    } else if (account.type === 'equity') {
      totalEquityPaisa += netPaisa;
      equityItems.push({
        code: account.code,
        name: account.name,
        nameBn: account.nameBn,
        amount: fromPaisa(netPaisa),
      });
    }
  }

  const netProfitPaisa = totalRevenuePaisa - totalExpensesPaisa;
  const grossProfitPaisa = totalRevenuePaisa - cogsPaisa;
  const totalEquityWithRetainedPaisa = totalEquityPaisa + netProfitPaisa;
  const endingCashPaisa = cashInflowPaisa - cashOutflowPaisa;
  const netVatPayablePaisa = outputVatPaisa - inputVatPaisa;

  return {
    trialBalance: {
      rows: trialRows,
      totalDebit: fromPaisa(tbDebitPaisa),
      totalCredit: fromPaisa(tbCreditPaisa),
      isBalanced: tbDebitPaisa === tbCreditPaisa,
    },
    profitAndLoss: {
      revenue: revenueItems,
      expenses: expenseItems,
      totalRevenue: fromPaisa(totalRevenuePaisa),
      totalExpenses: fromPaisa(totalExpensesPaisa),
      grossProfit: fromPaisa(grossProfitPaisa),
      netProfit: fromPaisa(netProfitPaisa),
    },
    balanceSheet: {
      assets: assetItems,
      liabilities: liabilityItems,
      equity: equityItems,
      totalAssets: fromPaisa(totalAssetsPaisa),
      totalLiabilities: fromPaisa(totalLiabilitiesPaisa),
      totalEquity: fromPaisa(totalEquityWithRetainedPaisa),
      retainedEarnings: fromPaisa(netProfitPaisa),
      isBalanced: totalAssetsPaisa === totalLiabilitiesPaisa + totalEquityWithRetainedPaisa,
    },
    cashFlow: {
      operatingInflows: fromPaisa(cashInflowPaisa),
      operatingOutflows: fromPaisa(cashOutflowPaisa),
      netCashFlow: fromPaisa(endingCashPaisa),
      endingCashBalance: fromPaisa(endingCashPaisa),
    },
    vatReturn: {
      outputVat: fromPaisa(outputVatPaisa),
      inputVat: fromPaisa(inputVatPaisa),
      sdPayable: roundMoney(vatMetrics.sdPayable),
      netVatPayable: fromPaisa(netVatPayablePaisa),
      taxableSales: roundMoney(vatMetrics.taxableSales),
      taxablePurchases: roundMoney(vatMetrics.taxablePurchases),
      challanCount: vatMetrics.challanCount,
    },
  };
}
