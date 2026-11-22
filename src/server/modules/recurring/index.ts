/**
 * Recurring Schedules Domain Module Boundary (Phase 7 Target)
 * Invariants:
 * - Uniqueness enforced on (organization_id, template_id, occurrence_key).
 * - Recurring runs generate DRAFT documents by default unless auto-approval policy is explicitly enabled.
 */
export const RECURRING_TEMPLATE_KINDS = ['invoice', 'supplier_bill', 'expense'] as const;
export type RecurringTemplateKind = (typeof RECURRING_TEMPLATE_KINDS)[number];
