# Bepari — Human-Centered UX / UI Design System
Principle: **A business user is trying to finish a real task, not admire a dashboard.**

## 1. Look & feel
- Emotion: dependable, calm, practical, respectful, businesslike, welcoming.
- Aesthetic: purposefully quiet; restrained accent; subtle borders; ample but efficient spacing; high-quality Bangla type; no unnecessary hero art.
- Default light UI, optional dark mode only after core flows work. No gradients/glassmorphism unless functionally necessary; avoid ornamental illustrations.
- Neutral surface `#FAFAF8`, white cards `#FFFFFF`, primary text `#172326`, secondary text `#5D686D`, border `#E0E6E2`, evergreen action `#126B58`, hover `#0C5345`, focus outline `#287A69`, warning `#A65E13`, danger `#B42318`. Validate WCAG contrast; values are design candidates not evidence of compliance.
- Fonts: Bengali `Noto Sans Bengali` or locally licensed alternatives with correct shaping; English Inter or system sans. Test all number shaping and layouts, export embedded WOFF/TTF in PDF only with appropriate licensing.
- Spacing 4px base, comfortable forms 8/12/16/24; 44px+ tap targets; compact legible data tables on desktop.

## 2. Content strategy
- Primary labels in natural Bengali: `নতুন ইনভয়েস`, `পেমেন্ট গ্রহণ`, `বকেয়া`, `ড্রাফট সংরক্ষণ`, `যাচাই করে ইস্যু করুন`, `স্টেটমেন্ট`.
- Prefer action-specific, honest labels to vague `Submit`, `Process`, `Continue`.
- When an action is irreversible, show consequence and a clear confirmation.
- Do not add repeated screen titles, generic greeting cards, decorative charts, meaningless positive statistics, unexplained badges or overly dramatic warnings.
- Never force the user to learn a proprietary term where 'Invoice', 'Receipt', 'Customer', 'Stock' is clearer.

## 3. Layout system
### Mobile (320–767)
- Top: organization/branch identity, search, notifications; bottom: fixed nav Home/Sales/Purchases/Money/More; `New` is a contextual action available without covering content.
- A task is one focused screen; use tabs/stepper only for genuine multi-stage workflows; sticky bottom action bar for Save Draft/Preview/Issue.
- Customer and item selection opens fast searchable picker, not a 2000-item select box.
- Details use grouped card/definition rows; filters via accessible sheet; long tables become compact rows with essential details.
- No unbounded vertical stacking; show summary + immediate actionable rows + View All; lazy load further data.
- Mobile keyboard must not obscure tax/total or primary action; save drafts safely when navigating.
### Tablet (768–1023)
- Adaptive two-column overview; list/detail side panel when usable; no giant desktop table squeezed into landscape.
### Desktop (1024+)
- Narrow left nav (collapsible), one task-oriented workspace header, context breadcrumbs only where needed.
- Main list with filter bar, inline status and sortable columns. Edit in side panel or full workspace; avoid modal inside modal.
- Keyboard-first: `/` search, `N` new when no focused input, Esc close, Ctrl/Cmd+S save draft when safe. Show shortcuts unobtrusively.
- Tables: user-configurable columns, sticky header, keyboard navigable, clear row actions; responsive max content width only when reading forms, not lists.

## 4. Human needs per screen
| Screen | First question answered | Primary action | What not to show |
|---|---|---|---|
| Home | What needs my attention today? | Resume key task | 12 decorative KPIs |
| Invoices | What invoices exist and which need action? | Create invoice | Three `Add` buttons |
| Invoice editor | Who, what, how much, when due, what tax? | Save/Preview/Issue | All 40 tax options upfront |
| Customer | How much do they owe and why? | Record payment | Duplicated dashboard data |
| Customer statement | What was opening, entries, closing? | Export/share | Fake payment graph |
| Purchases | What is ordered, received, billed? | Create purchase | Dummy vendor data |
| Inventory | What is physically available? | Receive/adjust | Confused quantity vs value |
| Banking | Which entries are not reconciled? | Review match | Auto-match ambiguous transactions |
| VAT | What tax documents/period exceptions need review? | Resolve exception | Fake NBR filing success |
| Reports | What changed and where? | Filter & drill down | Chart without source/definition |

## 5. Invoice editor exact behavior
1. Minimal initial fields: customer, issue/supply date, due date or terms, items, currency, optional notes.
2. Item picker: search SKU/name/barcode, show current price/unit/availability and tax category context; do not expose rate selection unless user authorized.
3. Line rows: product, qty, unit price, discount, tax treatment badge; detailed tax info on expansion.
4. Persistent inline total (subtotal, discount, VAT, other tax, grand total) and visible warning when rule not approved.
5. First action **Save Draft**, next **Preview**, **Issue/Post** only when role/validation permit. Issued post changes cannot be silently edited.
6. After posting: open invoice page with shortcuts `Download`, `Record Payment`, `Customer Statement`, `Share`; VAT 6.3 link only when truly applicable/issued.
7. Handle 404 customer, invalid tax rule, failed upload, rate changes, duplicate click and offline connection with clear human messages and recovery action.

## 6. Empty/error/loading states
- Empty: `এখনো কোনো ইনভয়েস নেই। প্রথম ইনভয়েসটি তৈরি করুন।` one relevant action.
- Loading: stable skeleton preserving layout; never fake totals.
- Permission denied: `এই কাজের অনুমতি নেই। প্রতিষ্ঠানের অ্যাডমিনের সঙ্গে যোগাযোগ করুন।`
- Validation: explain exact field and how to fix.
- Server error: provide retry & correlation ID; do not announce success prematurely.
- Offline: `ইন্টারনেট নেই—ড্রাফট স্থানীয়ভাবে রাখা হয়েছে; এটি এখনো ইস্যু হয়নি।`
- Real not-yet-built feature must be hidden behind a disabled route/clear phase label; no dead buttons.

## 7. Accessibility and localization
- WCAG 2.2 AA target: semantic HTML, label-input associations, keyboard nav, contrast verification, focus visible, SR announcements, error suggestions and reduced-motion.
- English keys must preserve sensible Bangla translation; avoid embedded English in strings for just layout convenience.
- Currency: `৳`, decimal/commas, ISO currency for multi-currency; localized date display while storing UTC times. Documents preserve correct Bengali print layout.
- Large font settings and display zoom must not break forms. Test 200% zoom and device widths 320/360/390/768/1024/1440.

## 8. Design review — AI-slop rejection checklist
Reject a screen when any applies:
- 4+ competing primary actions or repeated actions in header/card/footer.
- decorative gradient/glassmorphism, generic sparkles, random emoji/icons used as decoration.
- meaningless KPI cards with numbers not backed by live DB.
- unnecessarily long single-page scrolling of unrelated forms.
- several independent left sidebars or 3 toolbars stacked on mobile.
- overfilled text boxes, visually jarring contrast, broken Bangla typography.
- click leads to fake toast without server-side persistence.
- similar unrelated modules share the same cookie-cutter card layout.
- destructive action not explained / no recovery path.
- finance terms or validation ambiguous to a non-accountant.

## 9. Usability study plan
5 users per round across owner/sales/accountant, two rounds minimum. Tasks: create invoice for repeat customer, receive partial payment, view overdue, export statement, complete GRN, reconcile bank line, identify VAT exception. Measure success/failure, time, clicks/taps, confusion, incorrect actions; compare against target metrics, revise design before broad release. Interviews and test results should supersede aesthetic guesses.
