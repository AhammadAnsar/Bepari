# Bepari — Product Requirements, Accounting Matrix, Tax Register, UX, API & Security Docs

See also the complete specification files in `/public/assets/aistudio/` and modular docs in `/docs/`:
- **Product Requirements**: Multi-role SME business management (`owner`, `admin`, `accountant`, `sales`, `purchaser`, `storekeeper`, `auditor`) with strict server-side RBAC enforcement.
- **Accounting Posting Matrix**: Every financial event posts balanced `NUMERIC(20,6)` entries to `journal_entries` and `journal_lines`. Summary balances are never mutated directly.
- **Tax Rules Register**: Reference date 21 November 2026. All tax profiles initialize with `compliance_status = 'needs_review'`. No universal 15% VAT rate is assumed. Official NBR sources (`nbr.gov.bd`) require human VAT specialist sign-off before enabling Phase 6 tax issuance.
- **API Contract**: Prefix `/api/v1`, JSON validated with Zod, standard `{ data, meta: { requestId } }` and `{ error: { code, message, fieldErrors, requestId } }` envelopes, `Idempotency-Key` required on ledger writes.
- **Security Threat Model**: `scrypt` password hashing with random salts and constant-time comparison (`timingSafeEqual`), SHA-256 hashed opaque session tokens stored in memory on the client (never `localStorage`), server-verified active organization/branch context (`TEN-02`), composite tenant foreign keys (`TEN-01`), and PostgreSQL Row-Level Security.
