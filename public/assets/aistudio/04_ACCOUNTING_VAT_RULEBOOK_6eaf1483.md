# Bepari — Financial, Inventory & VAT Domain Rulebook
**Authoritative engineering rulebook.** Tax portions must be vetted by Bangladesh VAT counsel before production enablement.

## A. Financial engine invariants (non-negotiable)
1. Every posted event has one or more corresponding immutable journal entries; `sum(debit) == sum(credit)` exactly at decimal precision.
2. Financial source of truth is posted GL entries; AR/AP subledgers must reconcile to GL control accounts after advances, withholding and FX adjustments.
3. Store amounts in `NUMERIC(20,6)` and FX in `NUMERIC(20,10)`; decimal-safe calculations in service, decimal strings in API. Do not store JS floats or format before completing calculation.
4. Posted records cannot be edited/deleted. A correction is a link to an equal/opposite reversal or audited credit/debit note as appropriate. Preserve original reference, timestamp, actor and reason.
5. One logical action = one transaction + idempotency key + canonical source reference + audit trail. Deadlock/serialization retries only when idempotent.
6. Distinguish **financial date**, **document issue date**, **tax point**, **fulfilment date** and **actual created-at**. Tax point must be rule-derived and legally reviewed.
7. Period close ensures all subledgers reconcile, no unresolved tax exceptions, and period cannot be modified without privileged audited reopen procedure.
8. Monetary rounding policy: store high precision, round at correct tax/document points according to expert-reviewed policy, allocate residual pennies/taka subunits deterministically; never alter a document amount post-facto just to make a report match.
9. FX documents include original currency, FX rate, base-currency postings and realized/unrealized FX treatment where applicable. Phase-gate multi-currency support.

## B. Event-to-accounting posting matrix (illustrative defaults)
| Event | Debit | Credit | Business condition |
|---|---|---|---|
| Credit sale invoice | Accounts Receivable (gross) | Sales Revenue (net) + Output VAT/other liability (when applicable) | On approved/posted invoice under tax rules |
| Customer cash collection | Cash/Bank | Accounts Receivable | Only for allocated invoice portion |
| Customer advance | Cash/Bank | Customer Advance liability | Unallocated/advance collection |
| Allocate customer advance | Customer Advance liability | Accounts Receivable | When application to invoice authorized |
| Stock sale COGS | Cost of Goods Sold | Inventory asset | Fulfilment policy; not for service lines |
| GRN accepted stock | Inventory asset | Goods Received Not Invoiced (GRNI) | When inventory recognition policy applies |
| Supplier bill for matched received stock | GRNI (adjustments and eligible Input VAT per rule) | Accounts Payable | Supplier bill posted, match variance accounted |
| Supplier payment | Accounts Payable | Cash/Bank | Payment allocated |
| Supplier advance | Supplier Advance asset | Cash/Bank | Paid without bill allocation |
| Expense on credit | Expense account + eligible VAT input asset (if applicable) | Accounts Payable | Expense/bill approved |
| Expense paid immediately | Expense account + relevant tax debit | Cash/Bank | Direct paid expense |
| Sales credit note | Sales Return/Revenue contra + Output VAT reversal if allowed | Accounts Receivable/Refund liability | Only approved legal correction |
| Customer refund | Customer Refund liability / AR credit | Cash/Bank | Based on recognized credit and payment policy |
| Stock shrinkage | Inventory Loss expense | Inventory asset | Approved physical adjustment |
| Bank internal transfer | Destination money clearing/bank | Source bank | One transfer pair, reconciled |

**Example:** Invoice net BDT 10,000 + illustrative 15% VAT = total 11,500; Dr AR 11,500 / Cr Revenue 10,000 / Cr VAT Payable 1,500. This is **only a mathematical demo**, not a universal Bangladesh tax determination. Collection 5,000: Dr Cash 5,000 / Cr AR 5,000. Remaining invoice amount 6,500 before adjustments. Cost/stock postings are separate and depend on fulfillment.

## C. Deterministic transaction algorithms

### Post sales invoice (pseudocode)
```text
postInvoice(org, invoiceId, idempotencyKey, actor):
  authenticate actor; authorize sales.post in org and branch
  begin DB transaction with retry-safe isolation and scoped tenant context
  acquire lock on idempotency key and invoice row
  if completed same request key: return existing posted result
  if same key different request hash: return 409 IDEMPOTENCY_CONFLICT
  require invoice state approved AND fiscal period open
  verify customer belongs to org, active as customer, legal tax profile active
  validate line snapshot, quantity, prices, approvals, exchange rate
  calculate taxes from only APPROVED effective-dated rules
  if tax treatment uncertain/unapproved: stop with TAX_RULE_REVIEW_REQUIRED
  allocate document serial under sequence row lock (fiscal year/branch/type)
  calculate journal lines as decimal strings -> domain decimals
  validate journal balance and debit/credit control accounts
  atomically create immutable issued/posted snapshot, GL, AR, tax registers
  create applicable VAT doc 6.3 (IF registered and legally applicable)
  do NOT deduct stock here if stock moves at delivery; honor configured policy
  record audit and outbox event; mark idempotency complete; commit
  return posted invoice with assigned numbers, status, balances
```

### Receive and allocate customer payment
```text
receivePayment(org, party, moneyAccount, amount, method, allocations, key):
  authorize, validate cash account, org + party + currency, lock payment key
  validate amount>0; lock target invoices and current allocations
  enforce allocated_total <= receipt amount
  enforce each target is posted invoice for same party and org
  if remaining>0: credit Customer Advance liability (not AR)
  post cash/bank debit, AR credit for allocations, advance liability credit for remainder
  create allocation rows, audit and receipt number in one transaction
  retry with same key -> same result, never a duplicate receipt
```

### Generate recurring invoice
```text
for each due approved template:
  lock template and period occurrence row; calculate exact occurrence key
  create recurring_run with unique(template,occurrence_key)
  load current approved rule version by issue date
  create DRAFT invoice by default, unless auto-approval permitted by policy
  atomically link generated invoice; move next_run safely
  if retry/duplicate: return previous linked invoice
```

### Statement / aging
```text
statement(party, range):
  verify org and party
  opening = signed posted subledger activity before range.start
  rows = all posted AR-affecting entries within range ordered by date, sequence, id
  running = opening + debit - credit
  closing = opening + sum(debits) - sum(credits)
  reconcile closing to AR control-account party breakdown
  age open invoices by due_date relative to user-selected as_of_date
  include unapplied advances separately; DO NOT double-net without transparent display
```

## D. VAT / Mushak engine — legally reviewed configuration

### Core tax entities
- Tax profile per legal business/branch: registration type, BIN, source references, effective dates, reviewer.
- Tax rule versions: jurisdiction/sector, tax category, tax determination basis, calculation model, rate, SD/VDS/eligibility parameters, effective_from/to, enacted SRO/ref, approval status, reviewed_by.
- Tax classification on each item/service and each transaction line. Rule resolution must use `(business profile, supplier/recipient context, supply type, place/date, item category, tax point, exemptions, effective rule)`.
- Immutable tax document snapshot: exact invoice details, line tax components, buyer/supplier details, issue time, supply time, applicable format/version/serial.
- Applicable registers: 6.1 purchases, 6.2 sales, 6.2.1 purchase-sale trading, and other forms per actual legal eligibility.

### Relevant official document references — VERIFY the CURRENT effective regulation
- Mushak 2.1 / 2.3: Registration application/certificate details (profile/reference, not a replacement for NBR filing).
- Mushak 4.3: Input-output coefficient where required.
- Mushak 6.1: Purchase book.
- Mushak 6.2: Sales book.
- Mushak 6.2.1: Purchase-sale book where legally applicable.
- Mushak 6.3: Tax invoice with supplier/buyer and serial data governed by current rules.
- Mushak 6.4: Contractual manufacturing movement where applicable.
- Mushak 6.5: Branch/warehouse transfer documentation where applicable.
- Mushak 6.6: VAT deduction at source certificate where applicable.
- Mushak 6.7 / 6.8: Credit/debit note where applicable.
- Mushak 9.1 / 9.2: Return workpaper/preparation for eligible registrants/enlisted businesses.

### Critical regulatory warnings
1. Standard VAT may be 15%, but **do not set 15% for all goods and services**. Applicable rates and bases vary and change through law and SROs. Never invent a VAT rate, turnover threshold, VDS eligibility or schedule.
2. Official 2025 compiled Rule 40 text includes purchases/sales/trading registers and ERP-preservation language as amended; source https://nbr.gov.bd/uploads/rules/Authentic_English_Text_VAT_Rules_2016.pdf. Must review the current law/SRO and implementation applicability with legal specialist.
3. Confirm form field-level requirements, serial scheme, threshold for buyer identity, original/copy and any EFD/SDC/PKI POS obligations before enabling legal issuance.
4. For exemptions/zero rating/VDS/AT/SD, model legal reference and review status instead of guessing.
5. Period close and revised returns require accounting/legal policy; no silent edits to issued tax documents.
6. Never imply NBR electronic filing/API integration exists unless verified, authorized, implemented and working. A tax return *draft* is not filed.
7. NBR software enlistment is a separate regulatory process. Do not label Bepari 'NBR-approved' in UI or marketing.

### VAT calculation pipeline
```text
identify business tax profile at tax point
resolve relevant approved rate/treatment/source version
calculate per-line price/discount and taxable base with decimal-safe math
apply rule-appropriate SD then VAT or other statutory calculation order
apply valid exempt/zero-rated treatment, credit eligibility and VDS only if applicable
allocate rounding residual consistently across lines
persist line tax components, rule version, inputs and outputs as immutable snapshot
issue applicable tax doc with per-branch fiscal serial and timestamp
post VAT control account; update corresponding register, not a duplicate independent ledger
show tax preview with legal category/source and explanation before post
```

### VAT validation suite
- Date before/after an effective rule change; expired rule not used.
- Same item has different legally supported tax treatments by supply context.
- Discount-inclusive and exclusive, multiple lines, mixed exempt/taxable, credit note.
- Rounding totals reconcile invoice lines to document total to GL to register.
- Buyer/seller fields and required numbering verified with current form.
- Tax doc never generated for unregistered profile unless legally applicable.
- Negative and backdated VAT mutations blocked in locked periods.
- Return workpaper amount exactly reconciles tax register and VAT payable GL with documented reconciling items.

## E. Inventory valuation contracts
Choose one **explicit costing policy per organization/item category**: FIFO or weighted-average (both require reviewed implementation). GRNs capture quantity and value, stock movements are immutable, cost layer deductions are serially/concurrently safe, stock balance cannot go negative unless a documented specific business exception is approved. Transfers keep total stock unchanged across locations while properly moving valuation. Returns use policy-defined cost recovery, not guessed current selling price. Posting/delivery must be idempotent. Reconcile stock valuation subledger to inventory GL after each batch/close.

## F. Document number algorithm
- Lock per `(organization, branch_scope, document_type, fiscal_period_key)` sequence row.
- Generate formatted number in one transaction, attach to immutable issued document.
- Reserve/gap policy follows legal requirement; do not automatically reuse canceled sequences.
- Provide uniqueness constraint and concurrency test (e.g., 100 simultaneous issue requests produce unique numbers, no duplicates).
- Test reopening same document after network retry does not allocate another number.

## G. Bank/receipt/expense safety
- Bank import dedupes by file hash + row signature; candidate matching does not auto-confirm ambiguous transactions.
- Cash/bank transfers must have matching entries and reconciliation effect.
- Approved expenses classify account/category, cost center, VAT eligibility, branch, and attachments. No empty arbitrary account mapping.
- Receipt/credit note refund flows preserve liability and traceability.

## H. Reconciliation dashboard checklist
Daily: AR vs GL, AP vs GL, cash/bank vs GL, inventory vs GL, sales invoice totals vs sales register vs output VAT, purchase/bill totals vs input VAT, unposted draft vs posted totals, failed recurring jobs and duplicate idempotency attempts.

**Release block:** Any unexplained imbalance, duplicate document, cross-tenant disclosure or unapproved tax rule blocks production release.
