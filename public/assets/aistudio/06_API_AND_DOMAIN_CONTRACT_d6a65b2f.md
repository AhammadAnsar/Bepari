# Bepari — Domain Service and API Contract

## API architecture
- Path prefix `/api/v1`; JSON validated with Zod on server; standard UTC ISO timestamps and decimal-string money.
- Authenticated org membership and permission middleware required for all tenant routes.
- Identity obtained from verified session/JWT; active org from server-validated membership, never trust bare `x-organization-id` or request body.
- Default request headers for writes: `Idempotency-Key` (required for issue/post/payment/recurring critical operations); optional `If-Match` / `version` for draft concurrency.
- Common response: `{ "data": ..., "meta": { "requestId": "..." } }`.
- Errors: `{ "error": { "code": "...", "message": "Human-readable localized message", "fieldErrors": { }, "requestId": "..." } }`.
- HTTP: 401 unauthenticated, 403 forbidden, 404 inaccessible or missing, 409 conflict/idempotency/version, 422 validation/tax review, 423 locked period, 500 internal (never raw SQL errors).

## Initial API endpoints (extend only through versioned contracts)
| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/api/v1/me` | Signed-in user, memberships, active org | authenticated |
| POST | `/api/v1/organizations` | One-time secure business creation | owner bootstrap |
| GET/POST | `/api/v1/parties` | list/create party | party.read/create |
| GET/PATCH | `/api/v1/parties/:id` | detail/update unarchived party | party.read/update |
| GET/POST | `/api/v1/items` | catalog list/create | catalog.read/write |
| GET/POST | `/api/v1/quotes` | quotations | sales.quote |
| GET/POST | `/api/v1/invoices` | invoice list/draft | sales.invoice.read/create |
| GET/PATCH | `/api/v1/invoices/:id` | detail/edit draft only | sales.invoice.read/update |
| POST | `/api/v1/invoices/:id/submit` | approval workflow | sales.invoice.submit |
| POST | `/api/v1/invoices/:id/approve` | approve after rule validation | sales.invoice.approve |
| POST | `/api/v1/invoices/:id/issue` | number + tax doc + ledger post | sales.invoice.issue |
| POST | `/api/v1/invoices/:id/credit-notes` | audited approved correction | sales.credit.create |
| GET | `/api/v1/invoices/:id/pdf` | server-generated commercial invoice | sales.invoice.read |
| GET | `/api/v1/invoices/:id/tax-documents` | related Mushak docs if applicable | tax.document.read |
| GET/POST | `/api/v1/payments` | list/receive payment | finance.payment.* |
| POST | `/api/v1/payments/:id/allocate` | allocate against invoice(s) | finance.payment.allocate |
| GET | `/api/v1/parties/:id/statement` | customer/supplier ledger date range | reports.party_statement |
| GET/POST | `/api/v1/purchase-orders` | purchase lifecycle | purchase.po.* |
| GET/POST | `/api/v1/goods-receipts` | stock receipt | inventory.receive |
| GET/POST | `/api/v1/supplier-bills` | supplier invoice | purchase.bill.* |
| GET | `/api/v1/inventory/balances` | per item/location balance derived from ledger | inventory.read |
| POST | `/api/v1/inventory/adjustments` | authorized stock adjustment | inventory.adjust |
| GET | `/api/v1/accounts` | chart of accounts | accounting.read |
| GET | `/api/v1/journal-entries` | immutable posted journals | accounting.read |
| POST | `/api/v1/periods/:id/close` | accountant closing wizard | accounting.close |
| GET | `/api/v1/tax/periods/:period/reconciliation` | VAT exceptions and GL reconciliation | tax.review |
| GET | `/api/v1/tax/documents/:id/pdf` | issued tax document when approved | tax.document.read |
| GET | `/api/v1/reports/trial-balance` | GL-derived report | reports.financial |
| GET | `/api/v1/reports/ar-aging` | receivables aging | reports.ar |
| POST | `/api/v1/recurring/templates` | recurring configuration | recurring.manage |
| GET | `/api/v1/audit-events` | filtered audit with no secret leakage | audit.read |
| GET | `/api/v1/health` | process liveness | public |
| GET | `/api/v1/ready` | DB connectivity and migration readiness | protected/ops |

## Example valid DTO
```json
{
  "partyId": "<UUID>",
  "invoiceDate": "2026-11-21",
  "dueDate": "2026-12-05",
  "currency": "BDT",
  "pricingMode": "tax_exclusive",
  "lines": [{
    "itemId": "<UUID>",
    "description": "Office supplies",
    "quantity": "2.000000",
    "unitPrice": "2500.000000",
    "discountAmount": "0.000000"
  }]
}
```
`<UUID>` is a placeholder in documentation only, not valid live JSON ID. `total`, `vat`, `postedBy`, `organizationId` and `serialNumber` must be computed/validated server-side rather than trusted from client input.

## Domain service ownership
| Service | Owns | Strict dependency |
|---|---|---|
| IdentityService | authentication memberships | no client trust |
| PartyService | customer/vendor identity | org scope |
| CatalogService | product/unit/price | inventory/tax categories |
| SalesService | quotes/order/invoice lifecycle | PostingService + TaxService |
| ProcurementService | PO/GRN/vendor bill | InventoryService + PostingService |
| InventoryService | stock movement and valuation | transaction-safe cost layers |
| PaymentService | receipt/payment/allocations | PostingService + money accounts |
| PostingService | general ledger immutable journal | financial validations |
| TaxService | effective rules, VAT docs/registers | licensed accounting/legal review |
| DocumentService | PDF/template and storage | authorized access |
| RecurringService | schedules/runs | idempotent Sales/ProcurementService |
| ReportingService | ledger-based read models | strict reconciliation |
| AuditService | actor/action/history | append-only logging |

## Domain events, outbox and job processing
- In-transaction outbox write adjacent to core DB changes. Worker polls/publishes idempotently. Never depend on external email success for the core accounting commit.
- Side-effect retry with exponential backoff + dead-letter / operator review. Never send repeated customer reminders without dedupe/rate limits.
- Recurring schedule uses timezone + stable occurrence keys; never generate duplicate invoices after restart.
- Event payload is minimal (resource IDs only where possible), not raw PII/tokens.

## Search/report/query rules
- Cursor pagination for transaction lists and stable order; filters always server-validated with tenant scoping.
- Search exact invoice IDs and normalized customer mobile; indexed text/tsvector for names and item names; do not log sensitive full mobile numbers.
- Report queries restricted by role and organization; exports use explicit data minimization and audit events.
- Financial date range semantics inclusive start/exclusive end, separate local `business_date` and UTC timestamps.

## Interfaces and consumers
Same service contract powers mobile PWA, desktop web, later native app and authorized external API. Never embed business rules only in React components.
