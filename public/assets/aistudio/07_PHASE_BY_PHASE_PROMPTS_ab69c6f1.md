# BEPARI — Google AI Studio Copy/Paste Phase Prompts

## How to use
First paste the entire **`01_MASTER_BUILD_PROMPT.md`** in a new Google AI Studio **Build → Web App** project. Preserve these reference docs in repo. Then run **ONE prompt below at a time**. Do not ask the agent to complete all phases in one message. Before each phase: ensure prior phase has `PASS` gates or explicitly controlled blockers and committed code. Never allow a module to be called complete because its UI exists without API/database/tests.

---

## PHASE 0 — Establish Real Foundation (First Run / Architecture)
```text
PROJECT: Bepari Business Management SaaS.
You are executing Phase 0 ONLY. Read the Bepari master prompt and all specification files. Inspect current files first; do not destroy existing code or rewrite unrelated modules.
Build an actual full-stack React/TypeScript/Vite frontend + Hono/Node API; PostgreSQL is mandatory for persistence, and Drizzle is the ORM. In an eligible AI Studio Starter Tier, request/provision Cloud SQL for PostgreSQL Developer edition. If unavailable, prepare a real external PostgreSQL adapter and migration scripts and report BLOCKED_DATABASE. Never use Firestore or localStorage as finance DB and never fake an auth flow.
Produce:
A. ADRs, documented monorepo or clearly partitioned app, configuration/env example (no keys), health/readiness endpoints.
B. Real authentication; secure owner and organization onboarding; branches, role scopes and server-side permission middleware. No fake admin/default password/first-admin bypass.
C. Tenant-scoped schema/migrations for organizational core, core parties/items/accounts/periods, document identity, journals and idempotency; PostgreSQL constraints, query indexes and RLS/tenant context strategy tested.
D. A restrained, high-quality bilingual responsive app shell with mobile navigation, desktop navigation, empty dashboard connected to the real backend, and user/business/branch switcher. No seeded fake financial KPI.
E. Basic API smoke tests, auth and cross-tenant tests, integration setup and CI scripts. Test actual migrations against disposable PostgreSQL.
F. README for AI Studio Preview vs production deployment, documented GitHub sync and predictable state.
Deliver a numbered implementation report with exact files changed, actual test results, observed limitations and Phase 0 exit checklist. STOP and request no arbitrary design choices.
```

## PHASE 1 — Accounting Integrity & Master Data
```text
Implement Phase 1 ONLY, preserving Phase 0 architecture/data and existing UX. First audit completed components, list missing dependencies and inspect migrations and tests.
Create Chart of Accounts tree, fiscal periods, branches, customer/supplier party master (single party with roles), contact/address/tax profile, items/services/units and categorized prices. Implement the double-entry posting engine with decimal-safe values, transaction and idempotency handling, immutable posted journal entries, reversals, control accounts and period validation.
Every financial write must enforce membership, role, branch, source ownership and tenant isolation. Use reviewed Drizzle migrations, atomic database transactions, authorization, validation, audit events and functional server-backed forms. Create real list/create/edit/archive UX for master data with global search; do not generate dummy records in production.
Prove with automated tests: debit=credit for posted journal, invalid cross-tenant FKs rejected, changes to posted lines blocked, draft edit version conflict handled, locked period rejected, 100 idempotent retries produce one posting, all tests actually executed. Document source schema and accounts mapping.
UI must be minimal, responsive and accessible, including proper Bengali labels and validation messages. Report what remains blocked. STOP.
```

## PHASE 2 — Sales Documents & Customer Workspace
```text
Implement Phase 2 ONLY. Audit current project first and do not duplicate tables/services already implemented.
Add quotation and sales order lifecycle, customer 360 page, invoice drafts, line item selector, tax-preview (strictly only approved tax rules; otherwise clearly disabled with TAX_RULE_REVIEW_REQUIRED), approved/issued/posted states, legal document numbering, commercial invoice PDF, and invoice listing/filtering. Invoice lines preserve immutable snapshots of item names, prices, quantity, tax/rule version and transaction currency. Ensure quotes do not post the GL.
Use real PostgreSQL CRUD, server-side permissions and workflow transitions. Add appropriate default safe non-taxed demo mode only for synthetic sandbox demonstrations explicitly labeled as non-compliant; never issue a real VAT invoice with guessed rules.
Human-focused UX: quick customer search, item picker with keyboard navigation, responsive totals, progressive disclosure of advanced fields, Save Draft/Preview/Issue separated, real errors and empty states, print-ready Bengali text. On issue, create precisely one posted financial invoice and its proper AR/revenue/tax journal for approved rule. If tax legality is uncertain, prevent VAT issuance instead of inventing numbers.
Demonstrate creating an invoice, reloading it, updating a draft, rejecting an illegal mutation, viewing the GL and generating a readable PDF. Test concurrency/duplicate issue, permissions, PDF Bangla text and source invariants. Report and STOP.
```

## PHASE 3 — Receipts, Allocations, Customer Statements
```text
Implement Phase 3 ONLY without regressions. Introduce customer payment receipts, bank/cash/MFS reference details, partial and split allocations, unallocated advances, payment reversal/refund policy, party ledger, statement by date range, statement PDF and AR aging. The payment allocation and accounting entry must be in one transaction. A receipt amount cannot be overallocated and cannot pay another organization's or another party's invoice.
Create outstanding calculations from posted journals and allocations; derive opening/debits/credits/running/closing amounts. Statement always reconciles with GL control account. Provide efficient mobile payment capture and customer statement UX. Allow 30/60/90 overdue filters by as-of date.
Test: 11,500 illustrative invoice; 5,000 collection -> 6,500 due; overpayment recognized as advance; double-click retry yields one receipt; wrong org/party rejected; correction only via audit/reversal. Show actual DB and screenshot/e2e evidence. STOP.
```

## PHASE 4 — Purchase, GRN, Stock and Costing
```text
Implement Phase 4 ONLY. Audit full existing DB and accounting services first. Add purchase order, vendor bill, physical goods receipt (GRN), 3-way PO/GRN/Bill matching, supplier ledger/payment/advance, inventory products, warehouses, transfers and returns. Implement immutable stock movement ledger and explicit FIFO or weighted-average costing configuration; choose one initial method and document extensibility. Handle goods-received-not-invoiced (GRNI) and COGS under the event policy; do not reduce stock just because a sales invoice is created.
Require all items/vendors/warehouses to come from relational master data. Prevent negative stock by default and race conditions when two sellers sell last unit. Show shortage and variance errors in human-readable Bangla. Support service lines without stock movement. Add stock valuation report with GL reconciliation.
Test split goods receipt, partial PO, supplier mismatch, overreceiving, duplicate GRN, transfer net-zero, FIFO layers, inventory/GL reconciliation, concurrent last-unit sale and backdated locked period behavior. No AI-generated fake sales or warehouse counts. STOP.
```

## PHASE 5 — Expenses, Bank Reconciliation, Financial Statements
```text
Implement Phase 5 ONLY. Add operating expenses with categories, attachments, reimbursement if applicable, cash/bank money accounts, bank statement CSV import with dedupe, matching, reconciliation, opening balances, accounting period closing and financial reports: Trial Balance, P&L, Balance Sheet, Cash/Bank Book and cash flow (clearly document method and unsupported categories).
Add invoice/vendor bill partial settlement reconciliation as required and GL/subledger exception dashboard. Reports must use posted ledger data, not client-side fake charts or independent balances. Include stable fast queries with pagination/indexes.
Test expense approval/posting, wrong account, duplicate bank import, one-to-many match, financial reports derived exactly from GL, balanced trial balance, closed period immutability, safe reopening with audit. Print/export must preserve Bangla. STOP.
```

## PHASE 6 — Bangladesh VAT/Mushak & Compliance Module
```text
Implement Phase 6 ONLY. This is legally sensitive. Read authoritative current NBR VAT Act/Rules/SRO/form references and the repo tax rulebook. Do not assume the tax rules are legally approved merely because official sources were inspected. Build a versioned Tax Rules + Tax Profiles + Rule Review/Aproval Engine that stores source links, effective dates, jurisdiction/supply contexts, status and reviewer. Default any unverified tax treatments to NOT APPROVED/NOT ISSUABLE.
Build conditional Mushak tax document generation and registers 6.1, 6.2, 6.2.1, 6.3 where applicable; add VDS/6.6, credit/debit 6.7/6.8, transfer 6.5 only where legal applicability and templates have been verified and approved. Prepare 9.1/9.2 return WORKPAPERS with reconciliation to GL and source documents. Show compliance exceptions, exact source invoice links and detailed before/after corrections.
Do NOT claim NBR integration, return submission, NBR-approved software status or tax certification. Build a compliance approval checklist and maintain every rate/form/template with human reviewer status. If field-level current form template is unavailable or unverified, render a visibly labeled DRAFT and block official issuance.
Tests: mixed VAT/exempt lines, inclusive/exclusive math, discount allocation, effective-date changes, serial uniqueness, VAT register/GL reconciliation, VDS cases, credit notes, locked periods, no fake filing. Have independent accountant/tax advisor review workpapers before allowing production VAT features. STOP.
```

## PHASE 7 — Recurring Billing, Reports, Documents and UX Refinement
```text
Implement Phase 7 ONLY. Build recurring invoice/supplier bill/expense template rules (daily/weekly/monthly/yearly and custom schedule), pause/resume, effective-dated pricing/tax re-evaluation, duplicate-safe run logs and approvals. Generate drafts by default. Add reminders that avoid spam and properly handle job retries. Add purpose-driven reports and server-side PDF/XLSX/CSV export with filter and permission checks; templates with organization branding and Bengali font embedding.
Do deep UX review of EVERY implemented workspace for tasks, navigation, duplicated buttons, layout, backtracking, unnecessary scrolling, empty/loading/error states and responsive touch ergonomics. Change UX/UI only unless a tested bug requires logic changes. Do not refactor DB/payment/tax silently for styling.
Prove recurring job idempotency across restart, template end dates, changed VAT rules, failed notifications, PDF layout and accessible forms at 360/390/768/1024/1440 widths. Show before/after design rationale grounded in jobs-to-be-done. STOP.
```

## PHASE 8 — Multi-branch, POS, Portal, Integrations (conditional)
```text
Implement Phase 8 ONLY after all earlier gates pass. Add multi-branch stock visibility and transfers, scoped consolidated reports, optional simple POS/quick sale, business-to-customer portal, secure short-lived statement/document sharing and scoped API integration points. Design POS VAT/EFD/SDC/PKI POS features only if actual applicable regulatory requirements and integration permissions have been verified. No legally misleading POS tax invoice or fake payment gateway confirmations.
Optimize for mobile performance and desktop workflow without duplicating business logic. Use explicit owner-admin activation of advanced features and no default broad access. Add security and multi-tenant stress tests. STOP.
```

## PHASE 9 — Independent Audit, Hardening and Release Candidate
```text
Act as an INDEPENDENT multi-disciplinary audit team. No feature building before audit.
Inspect 100% of current repository, all migrations, server routes, integration points, domain service contracts, authorization, SQL constraints, indexes, posting logic, VAT rules, background jobs, templates and mobile/desktop views.
Deliver a severity-ranked findings register (Critical/High/Medium/Low) with concrete files/line numbers, reproducible proof, impact and specific repair plan. For each Critical/High defect, make a small fix with test and rerun regression. Do not mask violations with UI display changes. Run TypeScript typecheck, lint, unit/integration/e2e, concurrent posting tests, tenant isolation, auth/role, backup restore, DB migration upgrade + rollback rehearsal, PDF inspection, a11y and mobile usability tests.
Verify all major invariants: no unauthenticated access, no arbitrary tenant selection, no fake/demo production records, correct journal balancing, no duplicate numbers or recurring runs, no silent invoice edits, no stock mismatch, no unapproved tax rate or false NBR filing, real financial reports, graceful failure/recovery, safe migrations.
Produce:
1. FINAL_AUDIT_REPORT.md and RELEASE_GATES.md; 2. actual command+results table; 3. residual risk + accountable owner; 4. Legal and accountant sign-off items; 5. production readiness status with explicit PASS/FAIL/BLOCKED (not optimistic guesses).
If any critical or high-severity open issue, return NOT READY. Do NOT claim perfection. STOP.
```

---

## EXTRA — UI-only refactor prompt (run after working features)
```text
Inspect current Bepari project and its users' primary jobs. Perform a conservative HUMAN-CENTERED UX/UI REFINE ONLY. Do not change database schema/migrations, API contracts, auth/security, accounting, VAT, inventory, document numbering, workflow/business rules or financial data. If a genuine functional bug is discovered, document it separately; do not fix by hidden data mutation.
Remove generic AI-slop: repetitive large KPI cards, redundant headings, nested sidebars, fake buttons, excess gradients/glass, too many visual containers, long vertical scrolling, cluttered search, pointless decorative icons. Keep one clear visual hierarchy per screen; use compact mobile task flows and efficient desktop list/detail workspace. Ensure all text in Bengali/English proper localization, clear focus states, keyboard and 44px+ touch targets. Test every real action after layout edits with screenshot and Playwright workflows at 360/390/768/1024/1440. Give a before/after UX change log and regression test report. STOP.
```

## EXTRA — Financial integrity audit prompt (repeat before every release)
```text
Audit Bepari against the financial invariants in `04_ACCOUNTING_VAT_RULEBOOK.md`. Recompute posted journal balance, AR/AP reconciliation, inventory valuation vs GL, document number uniqueness, payment allocation totals, tax rule version usage and tax documents vs VAT register/GL. Check transaction isolation, same-key retry behavior, hidden auth bypasses and all org FK links. Present every discrepancy with ID, amount, source action and reproducible SQL/API test. Do not change historical posted records directly. Fix code only with approved reversible migrations and rerun full regression. Mark release BLOCKED if mismatches remain.
```

## EXTRA — Safeguard on returning to AI Studio from external tools
```text
Before making changes to this imported/synced Bepari codebase: compare current Git HEAD, migrations and app schema with known baseline. Preserve all existing data, code boundaries, tests and user-established UX. Never overwrite unrelated code or re-create tables because a generator forgot earlier context. Produce diff-first plan and identify risk. Keep one canonical architecture. STOP after requested scope.
```
