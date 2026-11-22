# Bepari — Phase 0 Release & Exit Checklist

- [x] **A. ADRs, partitioned modular app, `.env.example` (no keys), `/api/v1/health` and `/api/v1/ready`**: PASS
- [x] **B. Real authentication (`scrypt` + in-memory bearer token), secure owner & organization bootstrap, branches, role scopes, server-side permission middleware**: PASS
- [x] **C. Tenant-scoped schema/migrations (`drizzle/0000_phase0_foundation.sql`), composite FKs, query indexes, PL/pgSQL immutability & deferred balance triggers, and RLS policies**: PASS
- [x] **D. Bilingual (`bn`/`en`) responsive app shell with mobile 5-tab navigation, desktop collapsible navigation, honest empty dashboard, and org/branch switcher**: PASS
- [x] **E. Automated unit, auth, RBAC, cross-tenant, trigger, and RLS tests executed against disposable PostgreSQL 16**: PASS
- [x] **F. Live runtime database provisioning status**: `BLOCKED_DATABASE` (Cloud SQL Starter Tier returned `NO_VALID_PROJECT`; runtime fails closed per `OPS-02` until external PostgreSQL `PGHOST`/`SQL_HOST` is provided).
