/**
 * Documents & Bilingual Rendering Domain Module Boundary (Phase 2 & 7 Target)
 * Invariants:
 * - Document numbers are allocated transactionally under row lock on `document_sequences`.
 * - Server-generated PDFs embed Unicode Bengali fonts and render immutable snapshots.
 */
export const SUPPORTED_DOCUMENT_TYPES = [
  'quotation',
  'sales_order',
  'delivery_note',
  'sales_invoice',
  'sales_credit_note',
  'purchase_order',
  'goods_receipt',
  'supplier_bill',
  'supplier_debit_note',
  'payment_receipt',
  'expense_voucher',
] as const;

export type SupportedDocumentType = (typeof SUPPORTED_DOCUMENT_TYPES)[number];
