# Bepari — Security, Deployment & Operational Runbook

## Google AI Studio deployment recommendation (as researched November 2026)
1. Start at https://aistudio.google.com/apps in **Build mode**, select **Web App**.
2. Request full-stack React + Node and PostgreSQL. Eligible Google Cloud Starter Tier accounts can provision Cloud SQL for PostgreSQL Developer edition. If not available or quota exceeded, stop and set up explicit external PostgreSQL; NO Firestore substitution for accounting.
3. Firebase Authentication may be used for signed-in identities, but never treat Firebase login alone as authorization to access an organization. API must verify membership and permissions.
4. Store keys in AI Studio server-side Secrets/environment, not in frontend environment or bundled JavaScript. Run client bundle secret scan before publishing.
5. Sync app to GitHub at phase boundaries. GitHub is source code backup, **not database backup**.
6. Run database migration on a disposable/staging environment, then deploy with a reviewed transaction-safe migration plan. For live Cloud SQL manage connection pooling, failure modes and storage/network limits.
7. Publish to Cloud Run or migrate to a supported portable hosting arrangement. Cloud Run container filesystem is ephemeral; do not store user financial data/files only on local disk.
8. Starter Tier has eligibility, region and quota limitations; a prototype is not automatically production-ready or indefinitely free under increasing load.

## Runtime/config variables (names only)
```
NODE_ENV=
APP_BASE_URL=
DATABASE_URL=
SESSION_SECRET=
FIREBASE_PROJECT_ID=
FIREBASE_AUTH_ISSUER=
STORAGE_BUCKET=
STORAGE_ENDPOINT=
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
EMAIL_PROVIDER_API_KEY=
TRUSTED_PROXY_HOPS=
LOG_LEVEL=
```
Never commit real values. Validate required environment keys at startup and fail closed when absent. If using an alternate auth provider, replace Firebase-specific config rather than maintaining inert keys.

## Required app security
- Secure passwordless/OAuth or established identity provider, correct token audience/issuer/session validation, HttpOnly/Secure/SameSite cookies as appropriate, CSRF defenses for cookie-auth.
- One-time secure owner enrollment; no hard-coded system tenant and no default bypass in any environment used publicly.
- Organization membership, branch permissions, row scoping and optional PostgreSQL RLS. Restricted DB role for runtime, separate migration role. Review each API query for IDOR/tenant leak.
- Principle of least privilege across role assignments, documents, attachments, exports and settings. Admin cannot access another organization without authorized membership.
- Validation and parameterized queries everywhere. Cap expensive report queries and attachments; virus scan/size/type allowlist, signed object access, encryption at rest.
- Secrets redaction, response-safe error details, correlation IDs, login and critical action audit. Use non-editable audit backend/event store retention.
- Rate limits for login, export, posting and expensive search. Monitor abnormal posting/failed auth.

## Database reliability
- Managed PostgreSQL with automated scheduled backups and PITR where available; define tested RPO/RTO targets with business owner.
- Separate production, staging and local DBs. Never point AI Studio testing tools at live financial data without explicit safe read-only authorization.
- Migration forward/rollback plan; additive-first migration for live systems; snapshot/restore before incompatible schema changes.
- Serializable or row-lock-safe critical transactions (invoice numbering, inventory cost layers, allocation sums, bank reconciliation).
- Automated reconciliations and exception alerts after deployments.

## Observability
- Structured logs with request ID, org-scoped opaque ID, safe actor reference, outcome/duration, sanitized errors (not customer PII).
- Metrics: DB connection errors, API latency, posting attempts/failures, duplicate-idempotency responses, outbox backlog, recurring-run failures, document generation errors, VAT rule review blockers.
- Alert on reconciliation gaps and authentication/tenant boundary anomalies. Monitor upload/storage and worker job time.

## Bilingual PDF and printing
- Server-side HTML/Chromium or vetted PDF renderer; exact A4/thermal layouts as configured; embed approved Bengali Unicode font; verify shaping visually in PDF.
- Invoice/receipt/statement/tax documents use distinct templates, original business snapshots, series and issue dates; include QR verification only if it has real secured lookup and legal approval where required.
- PDF download links must be access-checked; do not embed sensitive public object URLs in plain search indexes.

## Backup restoration drill
1. Restore a production-like encrypted backup into isolated staging.
2. Run migration readiness checks and source document count checks.
3. Recompute JE balance, AR/AP, inventory valuation, VAT/GL register control totals.
4. Confirm UI access through real roles and no source PII leak into demo system.
5. Capture recovery timing, issues and accountable remediation.

## Release acceptance
- [ ] Accounting QA completed independently; sample transactions reconciled.
- [ ] Bangladesh tax professional reviewed each enabled VAT rule/form/template.
- [ ] Authentication and tenant penetration tests pass.
- [ ] Source code in Git and versioned DB migrations.
- [ ] Build, tests, E2E and accessibility run in CI.
- [ ] Backups and restoration verified.
- [ ] No hardcoded credentials, secrets or production demo data.
- [ ] Monitoring, error alerts, feature flags and kill-switch for uncertain tax features.
- [ ] User training/onboarding and support processes documented.

## Roadmap: Future-proof without overengineering
1. Start with a modular monolith and typed stable domain APIs; do not split microservices prematurely.
2. Use explicit schema migrations and ADRs for every material change.
3. Make tax and pricing rule engines versioned and testable rather than scattered hardcoded IF blocks.
4. Treat multi-currency, POS, integrations, multiple warehouses and offline as incremental optional capabilities after audited core.
5. Preserve source snapshots/audit events and API versioning to support future mobile/native clients.
6. Do not tightly couple the company's financial data to Gemini or AI Studio platform-specific storage; all core data remains portable PostgreSQL.
