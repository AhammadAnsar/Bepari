# Bepari — Accounting Posting Matrix
Authoritative Phase 0 baseline (see `/public/assets/aistudio/04_ACCOUNTING_VAT_RULEBOOK_6eaf1483.md` for full domain algorithms).

| Event | Debit Account | Credit Account | Condition |
|---|---|---|---|
| Opening Owner Capital | `1100` Cash / `1110` Bank | `3100` Owner Equity | Balanced posted journal entry in open fiscal period |
| Credit Sales Invoice (Phase 2) | `1200` Accounts Receivable Control | `4100` Sales Revenue + `2300` Output VAT Control (if approved rule) | Invoice approved & issued |
| Customer Cash Receipt (Phase 3) | `1100` Cash / `1110` Bank | `1200` Accounts Receivable Control | Allocated portion only |
| Unallocated Customer Receipt (Phase 3) | `1100` Cash / `1110` Bank | `2200` Customer Advance Liability | Unallocated remainder |
| Stock Sale COGS (Phase 4) | `5100` Cost of Goods Sold | `1300` Inventory Asset | On configured fulfillment event |
