# Bepari — Regulatory Source Register & Legal Verification Queue
**Research reference:** 21 November 2026. Not an attestation of compliance and not a legal opinion.

## Official references verified for project design
1. **NBR VAT forms directory** — https://nbr.gov.bd/form/vat/vat-2012 — includes 6.3, 6.5, 6.2, 6.2.1, 6.1, 4.3, 2.1, 9.2, 6.10 and 2.3 among published documents. Check latest templates, field labels and applicable amendment.
2. **NBR VAT rules** — https://nbr.gov.bd/regulations/rules/vat-rules/eng — includes English consolidated text of VAT and Supplementary Duty Rules 2016 published in November 2025; subsequent 2026 changes must be applied.
3. **NBR consolidated rule PDF** — https://nbr.gov.bd/uploads/rules/Authentic_English_Text_VAT_Rules_2016.pdf — Rule 40 describes purchase/sale/purchase-sale books, 6.3 issuance, serials, required information, and the ERP-system provision as amended 2025. Be careful with later SRO overrides.
4. **NBR VAT SRO listing** — https://nbr.gov.bd/regulations/sros/vat-sros — 2026 notices published. Fetch effective law and gazettes for real cases.
5. **NBR VAT FAQ** — https://nbr.gov.bd/faq/vat-faq/eng — describes general procedures including standard rate and 6.3; FAQ alone is not enough to approve sector-specific computations.
6. **NBR enlisted software firms listing** — https://nbr.gov.bd/nbr-enlisted/e-services/vatcalculator/eng — demonstrates separate software enlistment; does not automatically cover Bepari.
7. **Google AI Studio Build documentation** — https://aistudio.google.com/docs/aistudio-build-mode — full stack Node, React, GitHub, deploy, server secrets.
8. **Google Cloud Starter Tier documentation** — https://docs.cloud.google.com/docs/starter-tier — possible Cloud SQL PostgreSQL developer edition, eligibility/quota and region requirements.

## Mandatory compliance sign-off matrix
| Area | Implementation default | Sign-off source needed | Release gate |
|---|---|---|---|
| Registered vs unregistered vs turnover tax | collect profile, unverified flag | current law, BIN type, effective dates | no guessed taxable issuance |
| VAT item/service category | explicit classification | SRO, law, sector | enable only reviewed rules |
| VAT rate/base/SD/AT | versioned, disabled until reviewed | effective gazettes | no universal tax rate |
| Input tax credit | eligible status with evidence | law, valid purchase docs | no unreviewed credit |
| VDS / Mushak 6.6 | configurable reviewed case | 2025/2026 source-deduction rules | no blanket withholding |
| Mushak 6.3 format/fields | reference, draft preview | current official form and Rule 40 | valid issue only after review |
| Purchase/sales books 6.1/6.2/6.2.1 | source-backed registers | applicable current Rule 40 | reconciled registers |
| Returns 9.1/9.2 | workpaper draft | current statutory format/period rules | never claim submitted |
| 6.4/6.5 transfer/manufacture | phase-gated | business-specific rules | only legally applicable |
| 6.7/6.8 notes | audited correction engine | current credit/debit note rules | no silent overwrite |
| EFD/SDC/PKI POS | disabled until legal applicability | NBR official directions/integration | no false POS compliance |
| Software enlistment | 'not verified' | official registration/authorization | no NBR-approved marketing |
| Digital submission | integration unavailable by default | authenticated authorized API | never fake receipt/success |

## Review protocol
- Tax professional records: source URL/PDF, SRO number, source issue date, legal effective date, amended-by/withdrawn references, scope, calculation example, expected totals, reviewer, approval date and next-review date.
- Each rule has `draft` → `reviewed` → `approved` → `retired` workflow. Only approved rules valid at document's relevant tax point may be used for taxable legal issuance.
- Preserve tax determination snapshot in every posted/issued source document; future amendment must not rewrite old data.
- If no applicable reviewed rule exists, show `TAX_RULE_REVIEW_REQUIRED`, allow saving non-issued draft, prevent legal issuance and produce compliance task.

## Regulator communication
Approach NBR or qualified local VAT professionals for software enlistment, tax invoice requirements, electronic register obligations, returns and sector-specific/EFD/SDC rules. Do not ask end users to choose legal tax treatment solely through a dropdown without review.
