# Bepari — Product Requirements Specification (PRS)
Status: **Development Baseline**; production tax rules require specialist approval.

## Personas
1. **Owner:** see cash, today's sales, overdue receivables and profit without reading the general ledger.
2. **Sales staff:** prepare quotation/order/invoice and collect payment with minimal tapping.
3. **Purchaser:** manage vendors, purchase orders, receipt differences and vendor bills.
4. **Warehouse keeper:** receive, deliver, transfer, stocktake, identify unavailable items.
5. **Accountant:** reconcile every document, manage accounts, close periods, prepare statements and tax reviews.
6. **Auditor:** read immutable transactions, actors, attached evidence and correction trails without mutation rights.
7. **Organization administrator:** manage users, branches, settings, roles, billing and safe onboarding.

## Core modules
| Workstream | Features | Primary records | Phase |
|---|---|---|---|
| Foundation | Organizations, branches, users, membership, settings, roles, security, fiscal years | organizations, branches, memberships, fiscal_periods | 0–1 |
| Party management | Customers/suppliers, addresses, contacts, credit terms, BIN/TIN profiles, history | parties, party_roles, party_contacts | 1–2 |
| Catalog | Items/services, SKU, unit, price, barcode, tax category | items, units, item_prices | 1–2 |
| Sales | Quote, sales order, delivery, invoice, receipt, return, credit/debit, PDF | quotations, sales_orders, invoices | 2–3 |
| AR | Receipt, allocations, advance, statement, aging, reminder | receipts, allocations, ledgers | 3 |
| Procurement | PO, GRN, bill, return, 3-way match | purchase_orders, goods_receipts, supplier_bills | 4 |
| Inventory | warehouses, movements, transfers, reserved stock, costing | stock_movements, stock_cost_layers | 4 |
| Accounting | COA, JE, posting, periods, financial reports, closing | accounts, journal_entries, journal_lines | 1, 3–5 |
| Money | cash/bank, advances, bank import, reconciliation, transfers | cash_accounts, bank_statement_lines | 5 |
| Expenses | categories, expense claims, recurring, billable expenses, attachments | expenses, expenses_lines | 5 |
| VAT | rule versioning, tax docs/registers, returns workpaper, credit/VDS | tax_rules, tax_documents, vat_workpapers | 6 |
| Recurring | schedules, reruns, due notices, invoice/bill generation | recurring_templates, recurring_runs | 7 |
| Reporting | financial, stock, sales, AR, AP, cash flow, VAT, export | read models/views | 7 |
| Advanced | POS, branches, portal, API integrations, batch/serial | optional module tables | 8+ |

## Navigation (do not equate modules to menus)
- Mobile bottom navigation: Home, Sales, Purchases, Money, More. Global New action exposes a small contextual action picker; no floating button covering bottom content.
- More contains Inventory, Customers & Suppliers, Accounting, VAT, Reports, Settings, Admin (permissions and business context respected).
- Desktop side navigation groups: Overview / Transactions / People & Items / Finance / Compliance / Administration.
- Use a universal search command with item/customer/invoice/payment results filtered by permissions.

## Data rules
- Business `party` can have customer and supplier roles simultaneously; do not duplicate identity.
- Tenant-scoped FK must prevent linking an invoice to another organization's customer.
- Drafts can be edited, issued/posted docs cannot be overwritten; refund/credit/cancel via auditable reversal.
- Price quote snapshot immutable after acceptance; invoice lines snapshot item description, quantity, unit, tax determination, price, currency/rate.
- Payment allocation sum cannot exceed total payment; settlement calculations are derived from allocations and journal postings.
- Never mutate a summary field as source of financial truth; summary/reports are derived and can be cached/rebuilt.
- Every request is tied to identity + active membership + role/grants + organization/branch.

## Invoice fields
Document identity, organization, branch, customer, contact/address snapshot, order/delivery links, date/time, supply date, due date, currency and exchange rate, payment terms, document status, source, sales representative, cost center, line descriptions, SKU/item refs, qty/UOM, unit rate, discount type/value, line tax class/rate and legal basis, taxable base, VAT, SD/other applicable component, totals, already paid/allocations, remaining due, notes, approval, revisions, audit timestamps.

## Status and transition matrices
### Invoice
- `draft -> submitted -> approved -> issued -> posted -> partially_paid -> paid`
- `draft -> voided` for abandoned drafts; `submitted -> rejected -> draft` as controlled action; `issued/posted -> adjusted` through credit/debit mechanism, not destructive edit.
- `issued` vs `posted` may coincide in an atomic business transaction but remain semantically separate. Prevent two independent transactions from completing conflicting issuance/numbering.
- Payment state should ideally be derived from amount allocation; if cached, reconcile on every transaction.

### Purchase
- `draft PO -> approved PO -> partially_received -> received -> billed -> partially_paid -> paid` with partial delivery and bill matching.

### Inventory
- `planned -> reserved -> dispatched` or `received -> accepted`, with explicit return/transfer/adjustment operations.

### Tax
- `calculated -> reviewed -> issued -> archived`; draft return `prepared -> reconciled -> accountant_reviewed -> externally_submitted` only when user records actual external confirmation; NEVER auto-claim NBR submission.

## Role-based access
| Operation | Owner/Admin | Accountant | Sales | Purchaser | Storekeeper | Auditor |
|---|---|---|---|---|---|---|
| Create sales draft | ✓ | ✓ | ✓ | — | — | View |
| Approve/Post sales | Configurable | Configurable | Limited | — | — | View |
| Create PO | ✓ | ✓ | — | ✓ | — | View |
| Receive goods | ✓ | Limited | — | Limited | ✓ | View |
| Manage COA/period | ✓ | ✓ | — | — | — | View |
| Tax review/issue | ✓ | With grant | — | — | — | View |
| User/role settings | ✓ | — | — | — | — | View |
| Export sensitive report | With grant | With grant | Narrow | Narrow | Narrow | Configurable |

Enforce permission scopes on the server. Above matrix is defaults, not rigid code. Segregation-of-duties policy can require different preparer/approver. Avoid enabling all actions by default.

## Reusable domain events
`PartyCreated`, `QuotationAccepted`, `OrderConfirmed`, `FulfillmentCompleted`, `InvoiceApproved`, `InvoicePosted`, `PaymentReceived`, `PaymentAllocated`, `GoodsReceived`, `SupplierBillPosted`, `InventoryAdjusted`, `TaxDocumentIssued`, `PeriodClosed`, `RecurringOccurrenceGenerated`.

Events must be persisted with transactional outbox and consumed idempotently for side effects (notifications, exports). Do not rely on asynchronous events for balancing core GL and inventory postings which must commit together when required.

## Human workflows
**Quick Invoice:** Search customer → add product → qty/price → inspect tax and due date → preview → approve/issue → view generated files and next action. Show full summary on mobile before irreversible posting.

**Collect Payment:** Find customer/invoice → enter payment with method/reference → allocate to invoice(s) → show remaining unallocated and outstanding → confirm/post → receipt.

**Customer Statement:** Customer → Statement → choose date range → opening + debits + credits + closing → preview/export/share. Correct signs/ordering; handle partly settled invoices and advance credits.

**Purchase & Stock:** Supplier → PO → receive physical qty → compare invoiced qty and accepted qty → allocate landed cost → post supplier bill → pay. Use variance warnings.

**VAT Review:** Select tax period → tax docs validation → source line drilldown → reconcile GL VAT control accounts and registers → unresolved exceptions → export approved working papers. Only allow issuance/return preparation when rules are legally reviewed.

## Edge cases
Multiple currencies, timezone at DST-free Asia/Dhaka display, fiscal year switch, branch sequence, unit conversions, discount allocation rounding, non-taxable services, customer VAT eligibility, invoice overpayment, duplicated webhook, retried requests, concurrent invoice numbering, disputed invoices, partial returns, voided receipts, same party as vendor/customer, out-of-stock, backdated transaction in closed period, opening balances, disabled item linked in old invoices.

## Acceptance principles
A feature passes when it has: normalized DB + real persistence + server checks + a11y mobile/desktop form + functional lifecycle + correct accounting/tax effect + error/empty/loading states + PDF where required + automated tests + audit trace. Any failure is an incomplete feature.
