/**
 * Payments, Receipts & Allocations Domain Module Boundary (Phase 3 & 5 Target)
 * Invariants:
 * - Total allocations for a payment cannot exceed the payment amount.
 * - Unallocated funds remain in Customer Advance Liability / Supplier Advance Asset, not AR/AP directly.
 * - Cross-party and cross-tenant allocations are rejected inside serializable/locked transactions.
 */
export const MONEY_ACCOUNT_KINDS = ['cash', 'bank', 'mfs', 'clearing'] as const;
export type MoneyAccountKind = (typeof MONEY_ACCOUNT_KINDS)[number];
