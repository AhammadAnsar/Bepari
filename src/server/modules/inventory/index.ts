/**
 * Inventory & Valuation Domain Module Boundary (Phase 4 Target)
 * Invariants:
 * - Stock movements are append-only and idempotent by (organization_id, idempotency_key).
 * - Negative stock is prevented by default under row-locked cost layers.
 * - Stock valuation subledger reconciles to the Inventory Asset GL control account.
 */
export const STOCK_MOVEMENT_EVENTS = [
  'opening',
  'receipt',
  'delivery',
  'transfer_in',
  'transfer_out',
  'adjustment',
  'return_in',
  'return_out',
] as const;

export type StockMovementEvent = (typeof STOCK_MOVEMENT_EVENTS)[number];
