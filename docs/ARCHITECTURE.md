# Bepari — Architecture & Modular Monolith Design

## 1. System Topology
Bepari is a modular monolith built with:
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 (bilingual Bengali-first `bn` and optional `en`).
- **Backend API**: Hono running on Node.js (`server.ts` + `src/server/app.ts`) exposing `/api/v1/*`.
- **Database & ORM**: PostgreSQL (`pg.Pool` + Drizzle ORM `src/db/schema.ts`, migrations in `drizzle/0000_phase0_foundation.sql`).
- **Financial Arithmetic**: `NUMERIC(20,6)` in PostgreSQL and `decimal.js` (`src/server/shared/decimal.ts`) with decimal strings across API boundaries.

## 2. Partitioned Domain Modules (`src/server/modules/`)
- `identity/`: `scrypt` password authentication, SHA-256 hashed bearer tokens in `user_sessions`, session verification, active organization/branch context resolution.
- `organization/`: Atomic one-time organization owner bootstrap, branches, role-permission matrix initialization, member management.
- `parties/`: Unified customer/supplier party master with composite tenant foreign keys.
- `catalog/`: Units of measure and product/service catalog with decimal-string pricing.
- `finance/`: Chart of Accounts, fiscal period lifecycle, and central double-entry journal posting engine.
- `sales/`, `purchases/`, `inventory/`, `payments/`, `tax/`, `documents/`, `recurring/`: Explicit domain contracts and state invariants prepared for Phases 1–8.
- `reports/`: Honest workspace read models derived strictly from live database state (zero fake financial KPIs).
- `audit/`: Transactional append-only `audit_events` and `outbox_events`.
- `shared/`: Decimal math, structured error envelopes, and role-permission matrices.

## 3. Fail-Closed Database Policy (`BLOCKED_DATABASE` / `OPS-02`)
When neither Cloud SQL (`SQL_HOST`) nor an external managed PostgreSQL instance (`PGHOST`) is configured in the runtime environment:
- `/api/v1/health` returns `200 OK` (process liveness).
- `/api/v1/ready` and all database-dependent routes return `503 Service Unavailable` with `code: "BLOCKED_DATABASE"`.
- The system **never** silently downgrades financial persistence to Firestore, `localStorage`, SQLite, or in-memory mock arrays.
