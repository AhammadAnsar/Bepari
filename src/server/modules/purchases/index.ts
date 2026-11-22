/**
 * Purchases & Procurement Domain Module Boundary (Phase 4 Target)
 * Lifecycle: draft PO -> approved PO -> partially_received -> received -> billed -> partially_paid -> paid
 * Invariants:
 * - Goods receipt (GRN) and supplier bill are distinct domain events with 3-way matching.
 * - GRNI control account bridges physical stock receipt and supplier bill posting.
 */
export const PURCHASE_ORDER_STATES = [
  'draft',
  'approved',
  'partially_received',
  'received',
  'billed',
  'partially_paid',
  'paid',
  'cancelled',
] as const;

export type PurchaseOrderState = (typeof PURCHASE_ORDER_STATES)[number];
