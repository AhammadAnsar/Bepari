/**
 * Sales Domain Module Boundary (Phase 2 Target)
 * Lifecycle: draft -> submitted -> approved -> issued -> posted -> partially_paid -> paid
 * Invariants:
 * - Quotations never post to the General Ledger.
 * - Issued/posted documents are immutable and corrected only via audited credit/debit notes.
 * - Tax calculation requires an explicitly approved, effective-dated tax rule (TAX_RULE_REVIEW_REQUIRED).
 */
export const SALES_DOCUMENT_STATES = [
  'draft',
  'submitted',
  'approved',
  'issued',
  'posted',
  'partially_paid',
  'paid',
  'voided',
  'adjusted',
] as const;

export type SalesDocumentState = (typeof SALES_DOCUMENT_STATES)[number];
