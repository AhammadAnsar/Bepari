# Bepari — Database Schema & Migration Reference (Phase 0)

## Migration Files
- **Forward Migration**: `/drizzle/0000_phase0_foundation.sql`
- **Rollback Migration**: `/drizzle/0000_phase0_foundation.down.sql`
- **Drizzle Schema**: `/src/db/schema.ts`

## Core Tables Implemented in Phase 0
1. `app_users`: User identities (`id`, `auth_subject`, `display_name`, `email`, `password_hash`, `is_active`).
2. `user_sessions`: Server-side sessions storing SHA-256 `token_hash`, `active_organization_id`, `active_branch_id`, `expires_at`, `revoked_at`.
3. `organizations`: Tenant root (`legal_name`, `trade_name`, `legal_country`, `base_currency`, `timezone`, `reporting_language`, `status`).
4. `organization_members`: Role memberships (`owner`, `admin`, `accountant`, `sales`, `purchaser`, `storekeeper`, `auditor`, `custom`).
5. `role_permissions`: Explicit per-organization `(organization_id, role_code, permission_key)` grants.
6. `branches`: Tenant branches with composite unique key `(organization_id, id)` and `(organization_id, code)`.
7. `fiscal_periods`: Accounting periods with `CHECK (starts_on <= ends_on)` and status (`open`, `locked`, `closed`).
8. `tax_profiles`: Organization/branch VAT profile defaulting to `compliance_status = 'needs_review'`.
9. `parties`, `party_roles`, `party_addresses`: Unified customer/supplier identity with composite tenant FKs.
10. `units`, `items`, `warehouses`: Product/service catalog and warehouse locations with `NUMERIC(20,6)` prices.
11. `business_documents`, `document_sequences`, `idempotency_records`: Document lifecycle metadata, scoped numbering sequences, and operation idempotency locks.
12. `accounts`, `journal_entries`, `journal_lines`: Chart of Accounts and immutable double-entry general ledger.
13. `audit_events`, `outbox_events`: Append-only audit log and transactional outbox.

## Database Invariants & Triggers
- `journal_balance_at_commit`: `DEFERRABLE INITIALLY DEFERRED` constraint trigger ensuring every `posted` journal entry has `SUM(debit) > 0` and `SUM(debit) = SUM(credit)`.
- `journal_lines_immutable`, `journal_header_immutable`, `journal_lines_no_posted_insert`: Prevent `UPDATE`, `DELETE`, or line insertion on any `posted` or `reversed` journal entry.
- `tenant_isolation_policy`: Row-Level Security (RLS) policy enabled across all 19 tenant-owned tables checking `organization_id = current_app_organization_id()`.
