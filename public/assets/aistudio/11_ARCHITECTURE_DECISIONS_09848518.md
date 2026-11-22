# Bepari — Architecture Decision Records (Initial ADRs)

## ADR-001: Relational accounting persistence
Decision: PostgreSQL with normalized tenant-scoped schema, Drizzle migrations and constraints, not Firestore/localStorage as financial source of truth. Rationale: strong transactions, double-entry integrity, joins, controls, audit consistency. Consequence: need real database provisioning and safe migrations in AI Studio.

## ADR-002: Modular monolith first
Decision: React PWA + Node/Hono modular monolith, domain services with ports and typed APIs; no microservices until scale/reliability evidence warrants them. Rationale: avoid complexity and cross-service accounting consistency failures.

## ADR-003: One ledger, multiple documents
Decision: Every financial source (invoice, bill, payment, credit, stock adjustment) maps to immutable, balanced journal entries. Balances derived rather than independently mutated. Rationale: reconciliation, audit, future changes.

## ADR-004: No fake tax compliance
Decision: Per-business reviewed tax rule versions, source-linked VAT doc templates, compliance gates. Tax legality must be verified externally. Rationale: legal changes and risk of misleading invoices.

## ADR-005: Mobile-first task UX
Decision: 5-destination mobile nav, progressive disclosure, dedicated task screens, desktop list/detail productivity, quiet neutral visual language, no redundant AI dashboard template. Rationale: quick real business tasks.

## ADR-006: Stable documents and identifiers
Decision: UUID internal IDs; scoped formatted document numbers allocated transactionally and by legal context; never use client-generated legal invoice numbers. Rationale: no collision/concurrent double issue.

## ADR-007: Multi-tenant safety
Decision: server-authorized tenant context + composite FKs + RLS as applicable + permissions and tests. Rationale: account data isolation must not rely on UI.

## ADR-008: Offline only for unposted drafts initially
Decision: offline/local cache may store user drafts, but issued/posted ledgers require server validation. Rationale: fiscal numbering, legal timing and concurrency.

## ADR-009: Evolving schema and rule versions
Decision: additive migration strategy, documented ADR changes, effective-dated VAT rules, versioned document snapshots, no uncontrolled schema regeneration. Rationale: future-proof and upgradeable.

## ADR-010: AI is optional and non-authoritative
Decision: LLM used for document explanation/search/suggestions only; not a source of truth for financial posting, VAT rates or regulatory submission. Rationale: deterministic reproducible auditability.
