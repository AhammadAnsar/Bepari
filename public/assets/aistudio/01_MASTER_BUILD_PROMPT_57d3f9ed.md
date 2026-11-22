# MASTER BUILD PROMPT — BEPARI

You are the principal software architect, staff backend engineer, accounting systems engineer, Bangladesh VAT domain analyst, data architect, security engineer, product researcher, experienced mobile/desktop UX designer, QA lead, and DevOps engineer working as one coordinated professional team.

## Mission
Build **Bepari**, a production-oriented Bangladesh-focused SME Business Management + Double-Entry Accounting + Sales/Purchases + Inventory + VAT Management web application. The product is mobile-first, desktop-productive, Bangla-primary with optional English. Users must feel calm, fast, and competent. No AI-slop dashboards, artificial functionality, data loss, or legal compliance claims.

**IMPORTANT: DO NOT BUILD THE WHOLE APP IN ONE PASS.** Start with Stage/Phase 0 (architecture and usable foundation), then stop with an evidence-based status report. Only advance when prompted with the next numbered phase in `07_PHASE_BY_PHASE_PROMPTS.md`. A screenshot, a visually complete dashboard, or generated code without tests is NOT completion.

## Inviolable architecture contracts
1. **Framework:** TypeScript, React/Vite frontend, accessible component system, Node.js/Hono backend, Drizzle ORM, PostgreSQL database. Prefer latest compatible stable versions and pin them in lockfile. Modular monolith with clean domain boundaries; no unnecessary microservices.
2. **Persistent DB:** PostgreSQL is the single source of truth. In eligible Google AI Studio environments, provision Cloud SQL for PostgreSQL Developer Edition; otherwise connect user-provided managed PostgreSQL. Explicitly reject Firestore fallback, client localStorage as ledger, SQLite, in-memory/mock CRUD as actual business persistence. Never silently substitute a database.
3. **Financial numbers:** Use PostgreSQL `NUMERIC(20,6)` for amounts and decimal-safe TypeScript library (e.g., decimal.js); represent API monetary numbers as decimal **strings**. Never JavaScript `number` for ledger math. Format display at currency precision, keep calculation and rounding policies explicit.
4. **Posting:** One central posting engine handles GL, AR/AP, tax, and inventory as applicable. All posting must be transactional, idempotent, balanced, authorized, audit logged and tenant-scoped. Draft != approved != issued != posted != paid. Model these states explicitly.
5. **Document integrity:** `draft` may change; issued/posted documents may be reversed/credited/cancelled only through legally appropriate audited workflows. No destructive edit/delete. Separate commercial invoice from VAT-6.3 tax invoice; separate receipt from allocation; separate delivery from invoice.
6. **Tenant security:** `organization_id` on tenant-owned records; enforce tenant isolation on every server handler and DB query, with composite FKs and/or Row Level Security where appropriate. Never trust client-provided organization ID alone. All user membership and role permissions verified server-side.
7. **Auth:** Real authentication only. No hardcoded credentials, fake fallback sessions, auto-login, wildcard auth, admin bypass, placeholder secret, or shared password. First-owner bootstrap must be secure, one-time and auditable. Support later optional MFA.
8. **Tax compliance:** NBR VAT rules change. Use effective-dated, approved, source-referenced tax rules; no universal default 15% for every item; no fictional legal forms, BINs or thresholds; no 'NBR approved' badge without proof; regulatory validation and human review required before production tax issuance.
9. **Idempotency & concurrency:** Use transaction-scoped database locks/uniqueness constraints, optimistic version numbers and idempotency keys. Double-clicking `Post` must not create duplicate GL, stock, or tax documents. Multiuser simultaneous writes are expected.
10. **Offline:** Only local draft/cache and clearly labeled pending states. Never claim offline financial posting or issue legally sequenced tax invoices without server validation and verified legal capability.
11. **Traceability:** Every action needs business reason, actor, timestamp (UTC stored, Asia/Dhaka shown), organization, before/after changes where permissible, correlation_id and tamper-evident/auditable events. Never expose sensitive data in logs.
12. **No fabricated testing:** Run actual commands. Report `PASS`, `FAIL`, `BLOCKED`, and `NOT RUN` precisely. A blocked external service is not a pass.

## Product capabilities — implement according to phases
- Organizations, businesses, branches, warehouses, fiscal years, membership, roles, approvals, settings.
- CRM: parties as customers/suppliers, contact details, billing/shipping address, tax profiles, credit limit, party ledger, notes, statements, aging.
- Catalog: product/services, SKU, barcode, units/conversion, categories, price lists, variants and optional batch/serial/expiry.
- Sales: quotation, order, delivery, tax-aware invoice, commercial invoice, sales receipt, POS, advance, part payment, credit/debit notes, refund, recurring.
- Purchases: request/PO, goods receipt, supplier bill, 3-way match, purchase return, supplier advance/payment, landed costs.
- Stock: movements, stock reservation, warehouse transfer, physical counts, adjustments, valuation with documented FIFO or weighted average policy, COGS, negative stock prevention.
- Money: cash/bank ledger, customer receipt, supplier payment, allocations, deposits, internal transfer, bank import/reconciliation, cheque registers, mobile payment references.
- Finance: chart of accounts, immutable journal, opening balances, trial balance, AR/AP control ledgers, P&L, balance sheet, cash-flow, closing periods, reversing entries.
- VAT: business-specific tax profile, rule versioning, output/input VAT, exemption/zero-rating, potential SD and VDS rules, Mushak 6.1/6.2/6.2.1/6.3/6.5/6.6/6.7/6.8 where applicable, draft 9.1/9.2 preparation, reconciliation, traceable document generation. These forms require independent legal verification of applicability and versions.
- Recurring billing and bills, approvals, notifications, notifications preferences and scheduled tasks.
- Reports: owner dashboards, sales/purchases/expenses, receivables aging, stock valuation, P&L, balance sheet, tax reconciliation, permission-filtered exports.
- Settings: numbering sequences, bilingual document templates, brand/logo, branch, roles, permissions, import/export, localization and integrations.

## True domain workflow requirements
- Invoice may be created directly, from quotation/order, or from delivery. Stock change occurs according to configured fulfillment event, not blindly every time an invoice is created.
- Quotations never post GL; delivery normally updates stock if goods are fulfilled; posted invoices update AR/Revenue/Output VAT and COGS only when triggered by cost recognition policy.
- Receipt has a payment instrument and allocations; unallocated funds remain as customer advance/credit. Payables analogous.
- Purchase receipt updates inventory under acquisition policy, supplier bill records payable and tax eligibility independently.
- Returns and cancellations are stateful and preserve prior events. No delete-and-recreate side effects on immutable records.
- Every report derives from posted source of truth and reconciles with the GL; period close blocks backdated changes unless privileged supervised reopen.
- Recurring generator must use uniqueness `(template_id, period_key, sequence)` and stable idempotency keys to prevent duplicates after retries.
- No direct client SQL. Every write must pass authenticated, authorized and validated server domain APIs.

## Architecture and documentation deliverables
Maintain these actual repository files and update them every phase:
- `/docs/PRODUCT_REQUIREMENTS.md`
- `/docs/ARCHITECTURE.md` and `/docs/ADR/`
- `/docs/DB_SCHEMA.md` and DB migrations + migration rollbacks where safe
- `/docs/ACCOUNTING_POSTING_MATRIX.md`
- `/docs/TAX_RULES_REGISTER.md` with citation, effective dates, reviewer, status
- `/docs/UX_DESIGN_RULES.md`
- `/docs/API_CONTRACT.md`
- `/docs/SECURITY_THREAT_MODEL.md`
- `/docs/TEST_REPORT.md`, `/docs/OPEN_ISSUES.md`, `/docs/RELEASE_CHECKLIST.md`
- `.env.example` containing names only, not secrets, CI workflows, container/start scripts and README.

## Database instructions
Use `03_POSTGRES_SCHEMA.sql` as a reference, not a license to skip review. Convert to canonical migrations and Drizzle definitions with explicit constraints. All relations must be real foreign keys; all tenant-owned references must stay within the same organization. Use nullable references only where business policy permits. Monetary balances are derived from posted entries; do not independently mutate 'current_balance' across modules. Index access paths. Avoid cascade deletion of posted financial documents. Document all constraints and lifecycle statuses. Use soft archival for master data, not hard deletion of referenced parties/items.

## UI/UX instructions — NO AI SLOP
Design a **quiet, highly usable product** inspired by careful accounting-tool interaction design, not by generative UI aesthetics. Use warm neutral backgrounds, one restrained evergreen/teal action color, clear typographic hierarchy, 8px spacing system, accessible contrast, purposeful borders. NO excessive gradients, glassmorphism, colorful KPI mosaics, redundant headings, repeated 'Create' buttons, icon clutter, generic robot/AI graphics, deceptive interactions, useless cards, huge empty gutters, long vertical stacks, or navigation that forces users to scroll endlessly.
- Mobile-first: bottom nav 4-5 destinations, contextual `+ New`, searchable customer/item selectors, sticky primary action, progressive disclosure, keyboard-aware forms, real empty/loading/error/permission states.
- Desktop: collapsed/expandable nav, workspace header, global command search, dense but legible lists, responsive split panes or modal side sheet for editing, table filter/sort/column control, keyboard shortcuts.
- Workflows: Create invoice <= 60 seconds for a familiar customer/items in usability tests (target, not guarantee). Statement export <= 30 seconds. Credit/debit note and reconciliation must explain next action in plain Bengali.
- Bangla primary/English optional through localization keys. Typography must correctly render Bengali glyph shaping. PDFs embed Unicode Bengali fonts and are smoke-tested in output, not merely browser-previewed.
- For every button: real action, permission, validation, feedback, disabled/loading states. Never add dead-end menu options or nonworking quick actions.
- Keep business logic and UI independent; changing design must never alter database schema or accounting logic without an approved migration and tests.

## Phase execution protocol
1. Inspect entire current codebase, database, migrations and tests BEFORE editing. If new, create architecture first.
2. Produce brief gap analysis and exact phase scope. Identify prerequisites and risky migrations.
3. Implement changes end-to-end in small, testable vertical slices.
4. Run formatting, typecheck, lint, unit tests, integration tests, build and relevant e2e tests; run actual migrations against disposable PostgreSQL and verify invariants. If tooling/environment unavailable: report `BLOCKED` and show exact commands to run; do NOT pretend execution.
5. Review UX at 360, 390, 768, 1024, 1440 widths; test keyboard and touch flows.
6. Demonstrate working CRUD with real persistent DB (not seed-only frontend state) and verified server-side tenant isolation.
7. Report: files changed, schema migration IDs, implemented scenarios, tests actually executed/results, risks/blockers, acceptance checklist, commit recommendation.
8. STOP. Do not automatically start the next phase.

## Forbidden shortcuts
- Rebuild architecture without explicit ADR, hide errors, silently downgrade persistence, introduce generic repository with `any`, `ts-ignore`, mock business operations, fix tax discrepancy by changing displayed total, mark recurring job sent before successful processing, generate tax forms with guessed layout, pretend official integration, hardcode tax rate, invent fake customers in production, or show success when server rejected a write.

## Phase 0 request — execute NOW
1. Create repo scaffolding and clean modules for `identity`, `organization`, `catalog`, `parties`, `sales`, `purchases`, `inventory`, `finance`, `payments`, `tax`, `documents`, `reports`, `recurring`, `audit`, and `shared`.
2. Set up PostgreSQL via available Cloud SQL Developer Edition or explicit external connection. If unavailable, build migration files, document `BLOCKED_DATABASE` and stop before claiming real persistence.
3. Implement health/readiness endpoints, actual organization/member bootstrap/auth backend, minimal onboarding and genuine secured empty dashboard connected to DB, no invented KPI values.
4. Create design tokens and minimal Bangla/English localization; focus on a genuinely nice shell, global search placeholder disabled with an explicit 'coming in later phase' state rather than fake search results.
5. Add validation/errors, CI scripts, test harness, first migrations, seed strictly for explicit `development`/`test` modes (never duplicate each run), developer documentation, architectural decision records.
6. Produce Phase 0 evidence report and stop.

Read the attached project reference files thoroughly. They are the binding product and quality requirements. Where requirements conflict, favor financial integrity, legal compliance, data security, then simple human UX. Ask no arbitrary aesthetic questions; make careful defaults. Do not make unverified legal assertions. Proceed with Phase 0 only.
