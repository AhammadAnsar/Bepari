/**
 * Bangladesh VAT & Compliance Domain Module Boundary (Phase 6 Target)
 * CRITICAL COMPLIANCE GATE:
 * - Never assume a default 15% VAT rate across items or services.
 * - Every tax rule requires effective dates, official NBR/SRO source citation, and human specialist approval.
 * - When no approved rule applies, return TAX_RULE_REVIEW_REQUIRED (HTTP 422) and block legal tax issuance.
 */
export const TAX_RULE_STATUSES = ['draft', 'reviewed', 'approved', 'retired'] as const;
export type TaxRuleStatus = (typeof TAX_RULE_STATUSES)[number];
