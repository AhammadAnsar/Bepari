# On-Device SQLite Database First, Optional Cloud D1 & npm Lockfile Fix

Updates the deployment architecture so **Bepari runs 100% on the user's device with a real relational SQLite database (`sql.js` WebAssembly + `IndexedDB` persistence)** out of the box when deployed via GitHub -> Cloudflare Pages—eliminating the `405` error completely with zero required cloud database setup—while preserving a seamless opt-in path to connect **Cloudflare D1** or a Node.js backend whenever a client requests cloud sync, and fixing the GitHub Actions lockfile error with `package-lock.json`.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Revised Architecture Alignment**:
> - **Device-First Real Database (Default on Cloudflare Pages)**: Every user/client opening the deployed Cloudflare Pages app runs a real 21-table SQLite database directly on their own device (`sql.js` WASM persisted to browser `IndexedDB`), starting cleanly at the 2-step **Owner Account & Organization Onboarding Wizard** with zero dummy data and zero network `405` errors.
> - **Opt-In Cloud Database Later (No Rewrite Required)**: Built-in **Cloudflare Pages Functions + D1** support stays ready inside the same shared router; whenever a client chooses cloud multi-device sync and binds a Cloudflare D1 (`DB`) database, the app automatically switches from `on-device` SQLite to `cloud-d1` without changing UI or accounting logic.
> - **GitHub Actions & npm Lockfile**: Replacing `bun.lock` with a committed `package-lock.json` resolves `actions/setup-node@v4` lockfile errors and standardizes builds on `npm`.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Fixes GitHub Actions Build Error**: Commits a valid `package-lock.json` (and removes `bun.lock`) so `actions/setup-node@v4` (`cache: 'npm'`) and `npm ci` pass reliably on GitHub and Cloudflare Pages.
  2. **Fixes Cloudflare `Request failed (405)` Permanently**: Replaces blind `POST /api/...` bootstrap calls with a safe `GET /api/runtime` check and routes API calls to the **On-Device SQLite WASM Engine** whenever no cloud backend is attached.
  3. **Full Real Database on Device + Portable Backups**: All customers, products, POS sales, invoices, Mushak 6.3 challans, double-entry journals, cash memo templates, and authentication run real SQLite queries on the device and persist across reloads/offline restarts in `IndexedDB` (with `.sqlite` database backup export/restore support in Settings).
- **Target Audience / Persona**: Shop owners, wholesalers, and SMEs using Bepari from desktop or mobile browsers—ready immediately after deploying on Cloudflare Pages without needing cloud database provisioning unless they opt into cloud sync later.

---

## 2. User Experience & Visual Design

- **Zero-Friction Startup on Cloudflare Pages**: Opening the deployed site lands directly on Step 1 of the 2-step **Owner & Organization Onboarding Wizard** backed by the on-device SQLite database—no `405` errors, no `DB` setup blockers, and no pre-seeded dummy data.
- **Clear Storage Mode Visibility & Data Safety**:
  - In **Settings -> Security & Backup**, users can see the active database mode (`On-Device SQLite` vs `Cloud D1` vs `Server SQLite`) and export or import a complete `.sqlite` database backup file anytime so device data is portable and safe.
- **Content-Type Guard on Network Requests**: Any probe to `/api/runtime` verifies `application/json` content-type so static HTML fallback pages on edge hosts can never trigger false API requests or `405` errors.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Shared Async SQL Engine (`DbClient`) Across On-Device WASM, Cloudflare D1, and Node SQLite**
  - *Chosen Approach*: Refactor all database queries, transactions, accounting/POS services, and API route handlers into one isomorphic TypeScript engine operating over a unified async `DbClient` interface implemented by:
    1. `BrowserSqliteAdapter` (`sql.js` WebAssembly + `IndexedDB` snapshot persistence) — default for static/Cloudflare Pages deployments without a cloud DB.
    2. `CloudD1Adapter` (Cloudflare Pages Functions + `env.DB`) — auto-enabled when a client attaches a Cloudflare D1 database.
    3. `NodeSqliteAdapter` (`better-sqlite3`) — active in local/AI Studio Node server (`server.ts`).
  - *Why*: Eliminates any duplicate prototype/mock code. Whether running on-device or in the cloud, the exact same SQL schema, double-entry ledger balancing, weighted-average/FIFO stock COGS, and NBR VAT calculations execute.
  - *Alternatives Considered*: Using plain `localStorage` JSON blobs (rejected—cannot support relational joins, foreign keys, ledger constraints, or clean cloud SQLite migration).

- **Decision 2: Runtime Auto-Detection via Safe `GET /api/runtime`**
  - *Chosen Approach*: On startup, the client checks `GET /api/runtime`:
    - Node server responds `{ engine: 'node-sqlite' }`.
    - Cloudflare Pages Functions with `env.DB` bound responds `{ engine: 'cloud-d1' }`.
    - Cloudflare Pages Functions without `env.DB` responds `{ engine: 'on-device' }` (HTTP `200`), and pure static hosts returning HTML/404 fall back cleanly to `'on-device'`.
  - *Why*: Eliminates `405 Method Not Allowed` forever while allowing zero-code switching to Cloudflare D1 later simply by attaching the `DB` binding in Cloudflare Dashboard.

- **Decision 3: Portable Web Crypto Authentication (`PBKDF2-SHA256`)**
  - *Chosen Approach*: Use standard Web Crypto (`crypto.subtle` PBKDF2-SHA256 + `crypto.getRandomValues`) for password hashing and session tokens across Browser, Cloudflare Edge, and Node 22+ (with backward verification for legacy `scrypt` hashes in Node).
  - *Why*: Runs natively inside browsers, Cloudflare Workers/Pages Functions, and Node without native C++ addons.

- **Security Safeguards Built In**:
  - **Parameterized Queries Everywhere**: All SQL operations across Browser SQLite, Cloudflare D1, and Node SQLite exclusively use `?` parameter placeholders.
  - **Real Server/Engine Auth & RBAC Enforcement**: Passwords are salted and hashed (never stored in plaintext), session tokens stay strictly in memory (never `localStorage`), and role permissions (`owner`, `accountant`, `manager`, `cashier`, `auditor`) are enforced inside the shared API router regardless of runtime mode.
  - **Strict Bundle & Credential Isolation**: Browser bundles only include the WebAssembly SQLite client (`sql.js`), keeping Node filesystem access and server environment variables isolated on the server/edge.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       React SPA Frontend (dist/)                        │
│     OnboardingWizard · LoginScreen · POS · Cash Memo · Backup/Restore   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │  Runtime Probe: GET /api/runtime
                     └───────────────┬───────────────┘
          ┌──────────────────────────┴──────────────────────────┐
          ▼ (Default on Cloudflare: On-Device)                  ▼ (When Cloud DB Enabled)
┌───────────────────────────────────────┐         ┌───────────────────────────────────────┐
│   In-Browser API Client Dispatch      │         │   HTTP fetch('/api/*') to Backend     │
│   Zero network calls; zero 405 errors │         │   Cloudflare Pages Functions / Node   │
└───────────────────┬───────────────────┘         └───────────────────┬───────────────────┘
                    │                                                 │
                    └────────────────────────┬────────────────────────┘
                                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             Shared Isomorphic API Router, Auth Core & Engine            │
│    Session Auth · RBAC · Double-Entry Ledger · Stock COGS · Mushak 6.3  │
└──────────┬─────────────────────────────────┬──────────────────┬─────────┘
           │                                 │                  │
           ▼                                 ▼                  ▼
┌─────────────────────┐         ┌─────────────────────┐  ┌────────────────┐
│ BrowserSqliteAdapter│         │    CloudD1Adapter   │  │NodeSqliteAdapter│
│ sql.js WASM + IDB   │         │ Cloudflare D1 (DB)  │  │ better-sqlite3 │
│ (Device Persistent) │         │ (Opt-In Cloud Sync) │  │ (Local / VPS)  │
└─────────────────────┘         └─────────────────────┘  └────────────────┘
```

- **On-Device Persistence Lifecycle (`BrowserSqliteAdapter`)**:
  - Loads `sql.js` WebAssembly bundled cleanly by Vite (`?url` asset import, works offline and on Cloudflare CDN without external URLs).
  - Hydrates existing SQLite binary bytes from `IndexedDB` (`bepari_local_db`) on startup, applies idempotent `initSchema` + `seedBaselineConfig` (empty organization awaiting onboarding + COA + VAT rules), and persists updated SQLite bytes back to `IndexedDB` cleanly after every mutating request or transaction.
  - Supports exporting/importing `.sqlite` database files in Settings so users can back up device data or move between devices anytime.
- **Opt-In Cloud Upgrade Path (`wrangler.toml` + Pages Functions)**:
  - Ships `wrangler.toml` (`pages_build_output_dir = "./dist"`, `nodejs_compat`) and a catch-all Cloudflare Pages `/api/*` handler. While `DB` is unbound, `/api/runtime` returns `{ engine: 'on-device' }` cleanly (`200 OK`); once a client creates a Cloudflare D1 database and binds it as `DB`, `/api/runtime` returns `{ engine: 'cloud-d1' }` automatically.
- **GitHub & Cloudflare CI Pipeline**:
  - Removes `bun.lock` and generates `package-lock.json` via `npm` so `actions/setup-node@v4` (`cache: 'npm'`) and Cloudflare Pages Git integration build deterministically with `npm ci` and `npm run build`.
