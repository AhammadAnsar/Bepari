import { fromPaisa, roundMoney, toPaisa } from './accounting';
import { calculateLineTax } from './vat';
import type {
  ComputedInvoiceLine,
  InvoiceLineInput,
  InvoiceStatus,
  RecurringFrequency,
  StatementRow,
  TaxMode,
} from './types';

export interface ComputedInvoiceTotals {
  lines: ComputedInvoiceLine[];
  subtotal: number;
  discountTotal: number;
  sdTotal: number;
  vatTotal: number;
  grandTotal: number;
}

/**
 * Computes line-by-line taxable values, SD, VAT, and invoice grand totals.
 */
export function computeInvoiceTotals(
  rawLines: InvoiceLineInput[],
  defaultTaxMode: TaxMode = 'exclusive'
): ComputedInvoiceTotals {
  if (!rawLines || rawLines.length === 0) {
    throw new Error('Invoice must include at least one line item.');
  }

  const lines: ComputedInvoiceLine[] = [];
  let subtotalPaisa = 0;
  let discountPaisa = 0;
  let sdPaisa = 0;
  let vatPaisa = 0;
  let grandPaisa = 0;

  for (const raw of rawLines) {
    if (!raw.description || !raw.description.trim()) {
      throw new Error('Line item description is required.');
    }
    if (!Number.isFinite(raw.quantity) || raw.quantity <= 0) {
      throw new Error(`Invalid quantity for "${raw.description}".`);
    }
    if (!Number.isFinite(raw.unitPrice) || raw.unitPrice < 0) {
      throw new Error(`Invalid unit price for "${raw.description}".`);
    }

    const discount = Math.max(0, roundMoney(raw.discountAmount || 0));
    const tax = calculateLineTax({
      quantity: raw.quantity,
      unitPrice: raw.unitPrice,
      discountAmount: discount,
      vatRate: raw.taxRate || 0,
      sdRate: raw.sdRate || 0,
      mode: raw.taxMode || defaultTaxMode,
    });

    lines.push({
      productId: raw.productId ?? null,
      description: raw.description.trim(),
      quantity: roundMoney(raw.quantity),
      unitPrice: roundMoney(raw.unitPrice),
      discountAmount: discount,
      taxRuleId: raw.taxRuleId ?? null,
      taxRate: raw.taxRate || 0,
      sdRate: raw.sdRate || 0,
      taxableValue: tax.taxableValue,
      sdAmount: tax.sdAmount,
      vatAmount: tax.vatAmount,
      lineTotal: tax.lineTotal,
    });

    subtotalPaisa += toPaisa(tax.taxableValue);
    discountPaisa += toPaisa(discount);
    sdPaisa += toPaisa(tax.sdAmount);
    vatPaisa += toPaisa(tax.vatAmount);
    grandPaisa += toPaisa(tax.lineTotal);
  }

  return {
    lines,
    subtotal: fromPaisa(subtotalPaisa),
    discountTotal: fromPaisa(discountPaisa),
    sdTotal: fromPaisa(sdPaisa),
    vatTotal: fromPaisa(vatPaisa),
    grandTotal: fromPaisa(grandPaisa),
  };
}

export function resolveInvoiceStatus(params: {
  grandTotal: number;
  paidAmount: number;
  dueDate: string;
  today: string;
  currentStatus?: InvoiceStatus;
}): InvoiceStatus {
  if (params.currentStatus === 'void' || params.currentStatus === 'draft') {
    return params.currentStatus;
  }
  const grandPaisa = toPaisa(params.grandTotal);
  const paidPaisa = toPaisa(params.paidAmount);

  if (paidPaisa >= grandPaisa && grandPaisa > 0) return 'paid';
  if (paidPaisa > 0 && paidPaisa < grandPaisa) return 'partial';
  if (params.dueDate < params.today) return 'overdue';
  return 'sent';
}

export interface OpenInvoiceCandidate {
  id: number;
  invoiceNumber: string;
  issueDate: string;
  balanceDue: number;
}

export interface AllocationPlan {
  allocations: { invoiceId: number; invoiceNumber: string; amount: number }[];
  allocatedTotal: number;
  unappliedCredit: number;
}

/**
 * Payment Allocation Engine: settles customer invoices either by explicit mapping or FIFO oldest-first.
 */
export function allocatePayment(
  paymentAmount: number,
  openInvoices: OpenInvoiceCandidate[],
  explicitInvoiceId?: number | null
): AllocationPlan {
  const paymentPaisa = toPaisa(paymentAmount);
  if (paymentPaisa <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  let remainingPaisa = paymentPaisa;
  const allocations: { invoiceId: number; invoiceNumber: string; amount: number }[] = [];

  const ordered = [...openInvoices]
    .filter((inv) => toPaisa(inv.balanceDue) > 0)
    .sort((a, b) => {
      if (explicitInvoiceId) {
        if (a.id === explicitInvoiceId) return -1;
        if (b.id === explicitInvoiceId) return 1;
      }
      return a.issueDate.localeCompare(b.issueDate) || a.id - b.id;
    });

  for (const inv of ordered) {
    if (remainingPaisa <= 0) break;
    const duePaisa = toPaisa(inv.balanceDue);
    const applyPaisa = Math.min(remainingPaisa, duePaisa);
    if (applyPaisa > 0) {
      allocations.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: fromPaisa(applyPaisa),
      });
      remainingPaisa -= applyPaisa;
    }
  }

  return {
    allocations,
    allocatedTotal: fromPaisa(paymentPaisa - remainingPaisa),
    unappliedCredit: fromPaisa(remainingPaisa),
  };
}

/**
 * Statement Generation Algorithm: Opening Balance + Chronological Transactions -> Running Balance.
 */
export function buildCustomerStatement(
  openingBalance: number,
  transactions: {
    date: string;
    type: 'invoice' | 'payment';
    reference: string;
    description: string;
    amount: number;
  }[]
): { rows: StatementRow[]; closingBalance: number } {
  let runningPaisa = toPaisa(openingBalance || 0);
  const rows: StatementRow[] = [
    {
      date: '',
      type: 'opening',
      reference: 'OPENING',
      description: 'Opening Balance',
      debit: openingBalance > 0 ? roundMoney(openingBalance) : 0,
      credit: openingBalance < 0 ? roundMoney(Math.abs(openingBalance)) : 0,
      runningBalance: fromPaisa(runningPaisa),
    },
  ];

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    const amtPaisa = toPaisa(tx.amount);
    if (tx.type === 'invoice') {
      runningPaisa += amtPaisa;
      rows.push({
        date: tx.date,
        type: 'invoice',
        reference: tx.reference,
        description: tx.description,
        debit: fromPaisa(amtPaisa),
        credit: 0,
        runningBalance: fromPaisa(runningPaisa),
      });
    } else {
      runningPaisa -= amtPaisa;
      rows.push({
        date: tx.date,
        type: 'payment',
        reference: tx.reference,
        description: tx.description,
        debit: 0,
        credit: fromPaisa(amtPaisa),
        runningBalance: fromPaisa(runningPaisa),
      });
    }
  }

  return {
    rows,
    closingBalance: fromPaisa(runningPaisa),
  };
}

/**
 * Computes next run date for a recurring billing profile using strict UTC YYYY-MM-DD math.
 */
export function computeNextRecurringDate(currentDateStr: string, frequency: RecurringFrequency): string {
  const [y, m, d] = currentDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));

  if (frequency === 'weekly') {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (frequency === 'monthly') {
    date.setUTCMonth(date.getUTCMonth() + 1);
  } else if (frequency === 'quarterly') {
    date.setUTCMonth(date.getUTCMonth() + 3);
  } else if (frequency === 'yearly') {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  }

  return date.toISOString().slice(0, 10);
}
