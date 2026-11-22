# BEPARI — Test Matrix & Production Release Gates
No claims of complete software without actual evidence. Each checklist item is `PASS / FAIL / BLOCKED / NOT RUN` with file/test reference and timestamp.

## Testing layers
- **Static:** TypeScript strict noImplicitAny, lint, formatting, secret scanning, dependency vulnerability review.
- **Unit:** exact decimal math, tax rule resolution, invoice totals/rounding, AR aging, inventory cost, date boundaries, permission rules.
- **Integration:** real disposable PostgreSQL transactions, Drizzle migrations, same-org and cross-org FK, concurrent posting, immutable financial history, failure rollback.
- **Contract:** OpenAPI schemas, typed API clients, RBAC and error codes.
- **E2E:** Playwright browsers on 360/390 mobile + 768 tablet + 1024/1440 desktop; keyboard and touch flows.
- **Document:** PDF export screenshot/page count, embedded Bengali glyph shaping, clear legal fields, no clipped content, correct print dimensions and document version.
- **Security:** authentication bypass, IDOR, CSRF/session strategy, SQL injection, XSS, file upload safety, permission/tenant scopes, secrets exposure, quota/rate limit.
- **Operational:** backup restore, durable scheduled jobs, retry after crash, disaster simulation, migration rollout/rollback, service read-only mode.
- **Usability:** real-task tests with owners/sales operators/accountants, friction logging, improvements.

## Mandatory test cases (sample IDs)
| ID | Scenario | Required assertion |
|---|---|---|
| AUTH-01 | Unauthenticated GET party list | 401, no party details |
| AUTH-02 | User of Org A GET invoice of Org B | 404/403 and no PII leak |
| AUTH-03 | Sales staff tries to close period | 403 + audit |
| TEN-01 | Cross-org party_id in invoice | rejected by service and DB FK |
| TEN-02 | Change selected org in body/header | cannot impersonate another membership |
| GL-01 | Single invoice posting | debit and credit equal precisely |
| GL-02 | Posted JE line edit/delete/append | blocked with immutable audit trail |
| GL-03 | Close period then backdate | rejected |
| GL-04 | Concurrent post retry 100 times | exactly one journal/document |
| GL-05 | Crash mid-transaction | all related changes rolled back |
| GL-06 | Reversal of posted invoice | original preserved, reversal balanced |
| DOC-01 | 100 concurrent number allocations | unique IDs; no reuse inconsistency |
| DOC-02 | Draft Save and edit | persists after refresh, revision checked |
| AR-01 | 11500 invoiced, 5000 receipt | exactly 6500 remains (demo only) |
| AR-02 | Overallocate 5000 receipt by 6000 | 422/409, no posting |
| AR-03 | Unallocated 1000 payment | Customer Advance, not AR |
| AR-04 | Statement opening/running/closing | same as party subledger/GL |
| AP-01 | PO/GRN/bill quantity mismatch | match variance surfaced, not silently posted |
| INV-01 | Partial GRN, two deliveries | correct warehouse stock and cost |
| INV-02 | 2 simultaneous orders for last unit | no negative available stock |
| INV-03 | Warehouse transfer | net overall zero stock qty, correct locations |
| INV-04 | FIFO cost layer consumption | matched COGS and inventory balance |
| TAX-01 | No approved tax rule | cannot legally issue tax document |
| TAX-02 | Tax rule changes on date boundary | correct source version persisted |
| TAX-03 | Mixed treatment/rounding/discount | invoice = GL = register |
| TAX-04 | Mushak 6.3 required identity & serial | validated against latest approved template |
| TAX-05 | VAT return workpaper | never reports electronic filing without confirmation |
| REC-01 | Recurring job crash and retry | one occurrence only |
| REC-02 | Paused schedule | no invoice generated |
| BANK-01 | Duplicate bank file | no duplicated transactions |
| PDF-01 | Bangla invoice in PDF | no missing glyph, clipping, invalid font |
| UX-01 | Mobile create invoice | task completed without hidden actions |
| UX-02 | All controls | keyboard/touch accessible, real server feedback |
| OPS-01 | Restore backup to staging | integrity verified and test suite passes |
| OPS-02 | Empty DB / env missing | explicit fail closed; no fallback fake data |

## Property-based and generative test properties
- Random valid journal pairs sum exactly to zero net in minor/decimal precision.
- Random valid document line discounts/taxes sum to exact header total under approved rounding policy.
- Invoice amount minus allocated receipts and valid credits equals outstanding.
- Stock sum of movement deltas equals quantity on hand per warehouse; transfers net zero across whole org.
- Same idempotency key + same body is stable; same key + different body yields conflict.
- All authorized resources from org A are unreachable from org B for every endpoint.
- Random scheduling/retry patterns never create duplicate recurring occurrence.

## Load and performance acceptance
Set measured baselines, not guessed guarantees. Test with at least 10k invoices, 100k journal lines, 10k items, multiuser concurrent posting. Report p50/p95 latency on actual staging environment and document query plans. Optimize using indexes and pagination rather than preloading all transactions in React. Add memory/leak metrics and expensive report safeguards.

## Release gates
### Phase 0
App boots; PostgreSQL real connection/migration; user sign-in and org boundary proven; no demo balance presented as real.
### Phase 1
All posting constraints and draft master data proven with tests.
### Phase 2
Invoice lifecycle + GL, number idempotency, commercial PDF with Bangla pass.
### Phase 3
Receipt allocations and statements reconcile with AR control account.
### Phase 4
Inventory subledger reconciles with GL and concurrent stock deduction safe.
### Phase 5
Financial reports reconcile to posted GL and period close tested.
### Phase 6
Current legal applicability reviewed; every enabled tax rule/form backed by dated official source and authorized reviewer; no false NBR claim.
### Phase 7
Recurring idempotency, document export, full UX test pass.
### Release Candidate
No unresolved Critical/High, no false compliance claims, real backups/restores, staged deployment with monitored rollback, accessibility/usability review and accountant/legal approval where relevant.

## Reporting template
```text
Phase: XX | Commit: <SHA> | Environment: <env> | Database migration: <id>
Changed files: [...]
Tests executed: command -> PASS/FAIL/BLOCKED/NOT RUN
Business scenario evidence: [IDs/screenshots/queries]
Security impact: [...] | Accounting impact: [...] | Tax impact: [...]
Remaining blockers / risks: [...] | Known legal unverified rules: [...]
Verdict: PASS / FAIL / BLOCKED
Next allowed phase: [number or None]
```

## Manual financial reconciliation sample
For every real business test fixture (synthetic only in test DB), compare invoice line amounts → issued doc totals → postings → AR/AP → tax register → report. Capture SQL IDs and reproducible steps. Never seed sample companies into production tenants.
