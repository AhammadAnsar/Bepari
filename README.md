# Bepari (ব্যাপারী) — Business Management & Double-Entry Accounting SaaS

Bangla-first, English-supported, mobile-first SME Business Management, Double-Entry Accounting, Inventory, and VAT Workpaper platform built for Bangladesh.

## Current Phase: Phase 0 (Foundation & Architecture)
This repository implements **Phase 0 ONLY** per the phased development protocol:
- **Full-Stack Modular Monolith**: React 19 + TypeScript + Vite + Tailwind CSS v4 frontend paired with a Node.js + Hono API (`/api/v1/*`) mounted via `server.ts`.
- **PostgreSQL & Drizzle ORM**: Canonical schema in `src/db/schema.ts` and versioned SQL migration in `drizzle/0000_phase0_foundation.sql` (including composite tenant foreign keys, `DEFERRABLE INITIALLY DEFERRED` journal balance trigger, posted journal immutability triggers, and PostgreSQL Row-Level Security policies).
- **Fail-Closed Persistence Gate (`BLOCKED_DATABASE` / `OPS-02`)**: Never falls back to Firestore, `localStorage`, SQLite, or in-memory mock data. When Cloud SQL or external PostgreSQL credentials (`SQL_HOST` or `PGHOST`) are absent, `/api/v1/ready` and database mutations return HTTP `503 BLOCKED_DATABASE`.

## AI Studio Preview vs. Production Deployment

### 1. AI Studio Preview Environment
In this AI Studio session, `cloudsql.CheckFeatureEligibility` returned `NO_VALID_PROJECT` ("No valid GCP project found with owner permissions and active billing.").
- To connect a live external PostgreSQL instance in AI Studio Preview, open **Settings → Secrets** and configure:
  - `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (or Cloud SQL `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`).
- Once configured, apply migrations with:
  ```bash
  npm run db:migrate
  ```
- Without these secrets configured, the preview app boots cleanly, `/api/v1/health` reports `200 OK`, `/api/v1/ready` reports `503 BLOCKED_DATABASE`, and the bilingual App Shell transparently displays the `BLOCKED_DATABASE` gate with zero fabricated financial KPIs.

### 2. Automated Verification with Disposable PostgreSQL
To test the actual SQL migrations, PL/pgSQL triggers, composite foreign keys, Row-Level Security (RLS) policies, `scrypt` authentication, one-time organization bootstrap, and cross-tenant isolation against a disposable PostgreSQL 16 instance:
```bash
npm run lint
npm test
npm run build
```

### 3. GitHub Sync & Production Cloud Run Deployment
1. **Sync to GitHub**: Commit all migrations (`drizzle/0000_phase0_foundation.sql`), schema definitions (`src/db/schema.ts`), and docs (`docs/*`) at each phase boundary. Remember: GitHub backs up source code and migrations, **not** live database state.
2. **Database Backup & Migration**: Run `npm run db:migrate` against staging PostgreSQL first, verify invariants, and enable automated backups + Point-In-Time Recovery (PITR) on production Cloud SQL.
3. **Production Start**: Build the frontend assets with `npm run build` and launch the server with `NODE_ENV=production npm start`.
