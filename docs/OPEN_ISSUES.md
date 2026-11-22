# Bepari — Open Issues & Blockers Register (Phase 0)

| ID | Severity | Status | Description & Next Step |
|---|---|---|---|
| `BLK-DB-01` | Operational Blocker | `BLOCKED_DATABASE` | AI Studio Starter Tier `cloudsql.CheckFeatureEligibility` returned `NO_VALID_PROJECT` ("No valid GCP project found with owner permissions and active billing."). Runtime `/api/v1/ready` fails closed with HTTP 503 `BLOCKED_DATABASE` until `SQL_HOST` (Cloud SQL) or `PGHOST` (external managed PostgreSQL) credentials are configured in AI Studio Secrets. Automated integration tests (`npm test`) run against a disposable PostgreSQL 16 engine (`@electric-sql/pglite`). |
| `LEGAL-VAT-01` | Compliance Gate | `OPEN (Phase 6)` | All VAT rules and Mushak templates require independent Bangladesh VAT counsel sign-off before production enablement. |
