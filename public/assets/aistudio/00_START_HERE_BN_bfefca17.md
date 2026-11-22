# Bepari — Google AI Studio Development Kit
**Version:** 1.0 | **Research date:** 21 November 2026 | **Product market:** Bangladesh SMEs

## উদ্দেশ্য
'Bepari' একটি বাংলা-প্রথম, ইংরেজি-সমর্থিত, মোবাইল-ফার্স্ট Business Management & Accounting SaaS। ব্যবসার স্বাভাবিক কাজ থেকেই invoices, receipts, customer statements, VAT registers, inventory movements, journal entries, cash/bank balances এবং reports সঠিকভাবে তৈরি হবে। লক্ষ্য: production-grade, human-centered, minimal, work-friendly, AI-slop-free।

> **সতর্কতা:** এই কিটটি পূর্ণ সফটওয়্যার নয়। এটি AI Studio-তে ধাপে ধাপে সফটওয়্যার নির্মাণের পূর্ণাঙ্গ specification, starter SQL, implementation prompts ও verification plan। AI-generated code বা সফল preview একা production readiness বা NBR approval প্রমাণ করে না।

## সবচেয়ে গুরুত্বপূর্ণ সিদ্ধান্ত
- Google AI Studio **Build → Web App**, native Android নয়। প্রথমে Responsive PWA তৈরি হবে।
- **React + TypeScript + Vite + Hono/Node.js + PostgreSQL + Drizzle ORM**।
- AI Studio-তে যোগ্য Starter Tier-এ **Cloud SQL for PostgreSQL (Developer Edition)** provision করা সম্ভব। না পারলে external PostgreSQL সংযুক্ত করতে হবে। **Accounting datastore হিসেবে Firestore, localStorage, IndexedDB, SQLite অথবা in-memory array-তে fallback করা নিষিদ্ধ।** IndexedDB কেবল সীমিত unposted/offline draft cache-এর জন্য হতে পারে।
- Auth-এর জন্য Google AI Studio সমর্থিত Firebase Authentication অথবা vetted equivalent নেওয়া যাবে; কিন্তু authorization সবসময় backend-এ এবং DB tenancy যাচাই করে হবে।
- Modular monolith, one canonical relational schema, central posting engine, immutable posted financial documents, transaction-safe workflows, versioned tax rules।
- User-facing app বাংলা-প্রধান, English optional। Design must feel authored by a thoughtful product designer rather than template-generated.
- কোনো বাস্তব VAT rate/legal eligibility/approval assume করা যাবে না; regulator-reviewed rules ছাড়া tax automation production-এ enable নয়।

## ফাইলসমূহ ও ব্যবহার
| File | উদ্দেশ্য |
|---|---|
| `01_MASTER_BUILD_PROMPT.md` | AI Studio-তে প্রথমবার paste করার authoritative master instruction |
| `02_PRODUCT_REQUIREMENTS.md` | Full requirements, entities, workflow, roles, permission matrix, feature scope |
| `03_POSTGRES_SCHEMA.sql` | Detailed PostgreSQL reference schema—migration authoring baseline |
| `04_ACCOUNTING_VAT_RULEBOOK.md` | Accounting, posting matrices, inventory, VAT, number sequences, edge cases |
| `05_HUMAN_UX_DESIGN_SYSTEM.md` | Responsive workspace, design tokens, interaction patterns, anti-AI-slop rules |
| `06_API_AND_DOMAIN_CONTRACT.md` | API resource contracts, services, events, errors, background jobs |
| `07_PHASE_BY_PHASE_PROMPTS.md` | Copy/paste-ready prompts for phased building; **run one phase at a time** |
| `08_TESTS_AND_RELEASE_GATES.md` | Unit/integration/e2e/security/property-based tests and go-live gates |
| `09_SECURITY_DEPLOYMENT_OPERATIONS.md` | Production security, Cloud SQL, GitHub, Cloud Run, backups, observability |
| `10_COMPLIANCE_SOURCE_REGISTER.md` | NBR research references; rules requiring legal approval |

## AI Studio-তে ঠিক কীভাবে শুরু করবেন
1. **Build mode → Web App** নির্বাচন করুন।
2. `01_MASTER_BUILD_PROMPT.md`-এর পুরো লেখা প্রথম prompt হিসেবে দিন; সঙ্গে চাইলে `02`–`10` ফাইল reference/attachments হিসেবে দিন। AI Studio-তে ফাইল যুক্ত করা সম্ভব না হলে phase অনুযায়ী প্রয়োজনীয় অংশ paste করুন।
3. **প্রথম run-এ শুধু foundation, architecture, schema/migration, authentication scaffold, design system, smoke tests** করান। AI-কে এক run-এ সব functional module build করতে দেবেন না।
4. `07_PHASE_BY_PHASE_PROMPTS.md` থেকে `PHASE 0`, তারপর ক্রমানুসারে পরের prompt। প্রতিটি phase শেষে tests এবং production code evidence সংগ্রহ করুন।
5. GitHub repo-তে versioned commit রাখুন। ডাটাবেজ migration Git-এ track করুন। প্রতিটি pass-এ code review করুন।
6. Real invoicing / legal VAT documents production-এ enabled করার আগে **business-user usability testing + independent accounting QA + Bangladesh VAT expert sign-off** নিন।

## খুব জরুরি: AI Studio-এর data tier
Google-এর 2026 documentation অনুযায়ী Starter Tier-এ Cloud SQL PostgreSQL Developer Edition থাকতে পারে; eligibility/quotas সীমিত। AI Studio Agent কখনো quota-তে Firestore-এ fallback করতে পারে। **BEPari-এর ক্ষেত্রে এই fallback গ্রহণযোগ্য নয়**: provisioning unavailable হলে database-dependent phase `BLOCKED` দেখাতে হবে এবং PostgreSQL connection set না হওয়া পর্যন্ত চালানো যাবে না। No fake CRUD, no demo array persistence.

## Definition of Done
একটি screen সুন্দর দেখালেই কাজ শেষ নয়। প্রতিটি feature-এর জন্য: DB migration, server domain service, access control, API, validation, errors, UI states, responsive and accessible UX, audit, test fixtures, automated tests, documentation এবং demo evidence দরকার।

## ৫টি নিষিদ্ধ shortcut
1. `localStorage`/mock data-কে real accounting database হিসেবে ব্যবহার।
2. Printed invoice ও PDF তৈরি হয়েছে বলে VAT compliance complete দাবি।
3. JWT/session টোকেন ছাড়া কোনো fallback login বা shared admin password।
4. Published transaction edit/delete করে history নষ্ট করা।
5. Test না চালিয়ে '100% working' claim।

## Official references
- Google AI Studio Build: https://aistudio.google.com/docs/aistudio-build-mode
- Google Cloud Starter Tier: https://docs.cloud.google.com/docs/starter-tier
- NBR VAT forms: https://nbr.gov.bd/form/vat/vat-2012
- NBR VAT rules: https://nbr.gov.bd/regulations/rules/vat-rules/eng
- NBR VAT SRO: https://nbr.gov.bd/regulations/sros/vat-sros
- NBR enlisted software firms: https://nbr.gov.bd/nbr-enlisted/e-services/vatcalculator/eng

**Recommended start:** Paste `01_MASTER_BUILD_PROMPT.md`, then run `07_PHASE_BY_PHASE_PROMPTS.md` sequentially. Never skip quality gates.
