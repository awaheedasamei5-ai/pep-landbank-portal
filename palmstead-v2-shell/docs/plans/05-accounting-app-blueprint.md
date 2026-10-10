# Accounting — Build Blueprint (renames/absorbs Finance, adds Payroll + Commission Calculator)

**Status: Phase 1 (analysis) below is real -- V1 checked directly (zero salary/payroll concept exists anywhere in index.html, confirmed by grep), real OSS research done via `gh api` (not assumed from marketing pages), real live schema checked before any new column was added. This is a large, multi-phase build; this doc covers the full scope but Part B's own status markers are the source of truth for what's actually shipped vs planned -- never trust this doc's existence as proof of completion, check the markers.**

## Part A -- Analysis (per the user's own 13-point OSS-integration process)

### A.1 -- What V1 actually has (ground truth for scope, not guessed)

- **Zero salary/payroll concept anywhere in V1** (`grep -n "salary\|payroll" index.html` returns nothing). Palmstead's agents are commission-only; Management and any salaried staff have never had a system-tracked wage. Payroll here is a genuinely new Palmstead capability, not a V1 port -- grounded in general payroll domain practice (below) plus the user's own explicit requirements, not reverse-engineered from V1 code that doesn't exist.
- Commission: already fully real and live (`get_commission_breakdown()`, Commission tab, Part B.4 of the superseded 04-finance-app-plan.md). The Commission Calculator (Part B.9 below) is new -- a manual what-if/entry tool, not a replacement for the real automated monthly calculation.
- Real staff roster today: 8 `profiles` rows (7 real staff + 1 leftover `webnexttestuser` test account, not Palmstead's concern to clean), all `role='agent'` except `manager`. The user's own ask ("add new people who may not be part of the staff") confirms Payroll/the Commission Calculator must support people outside `profiles` (contractors, new hires) -- a real design constraint, not an edge case to skip.
- Real receipt/commission PDF infrastructure (Part B.5/B.4 of 04-finance-app-plan.md) is the proven real pattern every new PDF here follows: `jsPDF` + the shared `pdfReport.ts`/`pdfSignature.ts` toolkit, a logo loaded via `loadImageAsDataUri('/trulander-logo.png')` falling back from an uploaded `app_config` logo, `pdfStampSignature` for sign-off.

### A.2 -- Real OSS research (`gh api`, not README-only)

| Repo | Stack (confirmed via `gh api`) | Stars / activity | What's real to take |
|---|---|---|---|
| `bigcapitalhq/bigcapital` | NestJS (TypeScript) backend, React 18 + Redux + Formik webapp, multi-tenant, Knex-style migrations, BullMQ/Redis queues | 3,931 stars, pushed **2026-10-09** (yesterday, actively maintained) | Real double-entry accounting domain model: chart of accounts, journal entries, invoicing, expense tracking, bank reconciliation, financial reports (P&L/balance sheet/cash flow). **No payroll module** (confirmed: a GitHub code search for "payroll" inside the repo returns nothing) -- it's a bookkeeping app, not an HR/payroll system. Backend (NestJS+Knex+Redis) can't run inside this Supabase/Postgres+Next.js shell -- adapt its real domain model and UI information-architecture, not its code, same treatment Midday got for the original Finance plan.
| `frappe/erpnext` (already catalogued, `feedback-oss-foundation-strategy-2026-09-11`) | Frappe/Python, huge | LOW literal-merge feasibility (already flagged) | Real, proven payroll domain concepts: a **Salary Structure** (earnings components + deduction components, assigned per employee), a **Payroll Entry** per pay period that generates **Salary Slips** per employee from their structure, with employee bank details captured once and reused on every slip. This is the real shape Part B.8 below is grounded in -- not ERPNext's code (Python, wrong stack entirely), its real, battle-tested payroll data model.

**Why not a literal fork of either**: both real candidates have backends in a completely incompatible stack (NestJS+Knex+Redis multi-tenant SaaS; Frappe/Python ERP). Forking either's backend into this Next.js+Supabase shell would mean rewriting 100% of the server layer anyway -- at that point "forking" buys nothing over designing the Postgres schema directly against Palmstead's own real `profiles`/`app_config`/RLS patterns, which is what Part B.8/B.9 do. Their real UI/data-model shape is what's reused, matching how `midday-ai/midday` was already used for the original Finance plan and `arhamkhnz/next-shadcn-admin-dashboard`'s `finance-v1` legacy template was used for Overview's charts.

### A.3 -- What a professional accounting system needs (general domain research, not just the user's own list)

A real small/medium-business accounting system's core modules, cross-checked against what Palmstead already has real infrastructure for:

| Module | Already real in Palmstead? | This blueprint's scope |
|---|---|---|
| Accounts receivable (client payments) | **Yes** -- Payments tab | No change, already real |
| Accounts payable (expenses) | **Yes** -- Expenses tab | No change, already real |
| Chart of accounts / general ledger | No | **Out of scope for this phase** -- Palmstead's real transactions (payments, expenses, commission) are already categorized (by category/agent), and a full double-entry GL is a materially bigger undertaking than what's been asked for; flagged in Part C, not silently dropped |
| Financial reports (P&L, cash flow) | Partial -- Overview's KPIs + chart | **In scope**: Part B.10, a real filterable report-generation section |
| Payroll | No | **In scope**: Part B.8, the biggest new piece |
| Commission | Yes, automated | **In scope (new tool)**: Part B.9, a manual calculator/what-if layer alongside the automated real one |
| Budgeting | Partial -- Expenses category budgets | No change for this phase |
| Bank reconciliation | No | **Out of scope** -- no bank-feed integration exists or was asked for; flagged in Part C |
| Tax | No | **Out of scope** -- not asked for, Ghana-specific tax rules (PAYE/SSNIT) would need real research before any number is shown as authoritative; flagged in Part C as a real gap, not silently assumed |

## Part B -- Build order

### B.1 -- Rename Finance → Accounting

**DONE 2026-10-10.** Sidebar entry, page title, and `<PageHeader>` now read "Accounting"; route kept at `/dashboard/finance` so the real `/receipt/:token` links and any bookmarks keep working -- only the display name changed. Tabs are now **Overview / Payments / Expenses / Commission / Payroll**.

### B.2 -- Receipt PDF layout fix

**DONE 2026-10-10.** Real bug: the QTY/UNIT PRICE/TOTAL table headers were left-aligned while their values were right-aligned (the exact "drifted away" complaint) -- fixed by right-aligning the numeric headers to match their values. `src/webnext/features/payments/lib/receiptPdf.ts`.

### B.3 -- Commission PDF: logo + sign-off + bank details

**DONE 2026-10-10.** Logo was being passed `null` into `pdfBrandedHeader` -- now loads `/trulander-logo.png` (same real fallback pattern the Quotation PDF already uses) or an uploaded config logo. Added a real "Payment sign-off" section: company bank name/account name/account number/branch/SWIFT (new `app_config` columns: `company_bank_name`/`company_bank_account_name`/`company_bank_account_number`/`company_bank_branch`/`company_bank_swift_code`), plus a signature line stamped with the issuer's own saved signature (same `pdfStampSignature` pattern receipts use). `src/app/(main)/dashboard/finance/_components/commission-panel.tsx`. Editing the bank fields via a real Settings UI is Part B.7 below, not yet built -- the columns exist and the PDF reads them, but Management can only fill them in today via direct SQL, not the app.

### B.4-B.6 -- (already shipped, see `04-finance-app-plan.md`)

Payments, Expenses, Overview, Commission (the automated monthly one) are the four already-real tabs this blueprint absorbs under the "Accounting" name. Not rebuilt, not re-scoped -- just renamed at the navigation level.

### B.7 -- Finance/Accounting Settings

A real in-app settings surface (per the user's own explicit ask: "build it fully, with its settings, where the features of the pdf can be edited").

**DONE 2026-10-10.** `use-finance-settings.ts` + `settings-panel.tsx`, new Settings tab, manager-only. Covers: company bank account details (the 5 columns added in B.3, previously only editable via direct SQL), the receipt/quote identity fields (`quote_company_name`/`company_phone`/`company_email`/`company_tin`/`company_address`/`quote_footer_address`/`receipt_thanks_text`) which had real `app_config` columns but **zero settings UI anywhere in this shell before this** (confirmed via search -- a real pre-existing gap, not introduced by this blueprint), and a real company logo upload (`receipt_logo_image`, reusing the already-proven `resizeImageToDataUri` helper) that Receipt/Commission/Payroll PDFs now all check before falling back to the bundled `/trulander-logo.png`. Verified live: form correctly pre-fills from real existing data (company name, phone, footer address), a saved bank name was confirmed picked up by the Commission PDF on the next generation, logo upload/preview/remove all confirmed working (file-dialog automation isn't available in this testing harness, so the upload *write* path was verified via a direct data-URI write + confirming the UI renders/removes it correctly, rather than a literal OS file picker). All test values reverted to null afterward.
   - **Payroll PDF template settings** (company payroll-specific text, breakdown-table-vs-totals-only toggle, etc.) remain deliberately deferred -- Payroll's own payslip shape is now real and built (B.8), so this is unblocked, just not yet done.

**Not yet built.** Real scope, not forgotten -- next concrete slice after B.8/B.9's own data shapes are settled.

### B.8 -- Payroll (the big new module)

**Real schema** (new tables, Postgres-native, grounded in the real ERPNext Salary-Structure/Payroll-Entry/Salary-Slip shape but designed fresh against Palmstead's own `profiles`/RLS patterns, not ported code):

- `payroll_staff` -- the real payee roster for payroll, **deliberately separate from `profiles`** per the user's own explicit requirement ("add new people who may not be part of the staff"): `id`, `profile_key` (nullable FK to `profiles.agent_key`, null for a non-staff payee), `name`, `role_title`, `bank_name`, `bank_account_name`, `bank_account_number`, `active`. A real staff member gets a row created once (pre-filled from `profiles`), a contractor/new-hire gets a row with `profile_key = null`.
- `payroll_salary_components` -- real earnings/deductions line items per payee per effective period, matching ERPNext's real "Salary Structure" concept: `payroll_staff_id`, `component_name` (e.g. "Basic Salary", "Transport Allowance", "SSNIT", "Income Tax"), `component_type` (`earning`|`deduction`), `amount`, `effective_from` (so a salary change doesn't rewrite history -- a past month's payslip must keep showing what was actually paid then).
- `payroll_runs` -- one row per month a payroll is generated: `period` (YYYY-MM), `status` (`draft`|`signed_off`|`paid`), `generated_by`, `generated_at`, `signed_off_by`, `signed_off_at`.
- `payroll_run_lines` -- the real frozen per-payee breakdown for that run (copied from `payroll_salary_components` at generation time, exactly like ERPNext's real Salary Slip freezing pattern -- a later change to someone's base salary must never silently rewrite a past month's already-generated payslip): `payroll_run_id`, `payroll_staff_id`, `component_name`, `component_type`, `amount`.

**Real security**: `payroll_*` tables are manager-only, full stop -- no agent-visible rows at all (unlike Payments/Expenses, which staff see their own rows of). This is real, sensitive compensation data; RLS policies gate every table to `my_role() = 'manager'`.

**Real UI** (Payroll tab): roster management (add/edit payees, including non-staff), per-payee salary-component editor, a "Generate payroll" action for the current month (freezes `payroll_run_lines` from the live components), a payroll run list with status, and a **real branded payslip PDF per payee + a combined payroll-run PDF** -- company logo, pay period, earnings/deductions breakdown, net pay, company bank account details, and a signature line for Management sign-off, matching the real pattern B.3 just built for Commission (same `pdfReport.ts`/`pdfSignature.ts` toolkit, not a new one-off).

**DONE 2026-10-10.** Schema + 2 RPCs (`generate_payroll_run`/`sign_off_payroll_run`) + full UI (`use-finance-payroll.ts`, `payroll-panel.tsx`, `payroll-pdf.ts`) all real and verified live end-to-end as Management: added a real staff payee (Elizabeth Misiame) and confirmed the "someone not on staff" path also inserts correctly (`profile_key = null`), added an earning + a deduction component with the net-pay total updating live, generated a payroll run, downloaded both the per-payee payslip and the combined bank-transfer PDF with zero console errors, signed off the run, and confirmed regeneration is then correctly blocked. RLS verified both ways -- a manager can read/write every `payroll_*` table, a non-manager (`elias`) sees zero rows. All test data cleaned up afterward (payroll_staff/payroll_salary_components/payroll_runs/payroll_run_lines rows deleted, back to zero).
   - **Real bug found and fixed before any UI touched it**: `generate_payroll_run()`'s own date filter compared a component's `effective_from` against the payroll period's *start* (`'2026-10-01'`) instead of its *end* -- since a component's `effective_from` defaults to the day it's created, any component set up partway through the same month it's meant to be paid for (the normal case, e.g. adding someone's first salary components today for this month's payroll) was silently excluded. Caught by the same direct-RPC-simulation discipline that caught the Commission `approve_payment` bug, before the UI was ever built on top of it.

### B.9 -- Commission Calculator

A real **manual what-if tool**, distinct from the already-live automated `get_commission_breakdown()`: Management manually enters a list of payments made in a chosen month (client/amount/plot type), assigns each to a staff member (including someone not in `profiles`, same roster concept as B.8), and the calculator runs the **exact same real formula** already proven in `get_commission_breakdown()` (personal = capped-per-payment contribution, pool = newcomer pool split across agents eligible under the real 3-month rule) against this manually-entered data -- not a second, divergent formula. Real settings: per-person "pool eligible" override (the user's own explicit ask: "a section where we click to indicate if a staff is entitled to pool using the 3-months rule" -- i.e. a manual override for a case the automated 3-month lookback can't see, such as a newly added person with no real payment history yet).

**DONE 2026-10-10.** Real schema (`commission_calc_sessions`/`commission_calc_entries`/`commission_calc_participants`, manager-only RLS, verified live both ways before any UI was built), reusing `payroll_staff` as the roster rather than a duplicate table -- "a payee" and "a calculator participant" are the same real concept. `use-commission-calculator.ts` + `commission-calculator-panel.tsx`, nested as a "Calculator" sub-tab alongside the automated "Monthly commission" view inside Commission (not a separate top-level tab -- same page, same mental model, per the user's own "in the commission section" framing). The formula is computed client-side (instant feedback as entries change, no round-trip needed for a scratch calculator) but is the identical real cap/price math `get_commission_breakdown()` runs, reading live rates from `app_config`. Both "new plot sale" and "pool eligible" are manual per-entry/per-participant flags, not auto-derived -- a hand-entered payment has no real lead history for the automated 3-month rule to check against. Verified live end-to-end: created a session, added a real Full Plot payment (GHS 48,000, matching the real live `full_price`), confirmed personal commission computed to exactly GHS 1,000 (`full_cap`) before toggling eligibility, then confirmed the pool share (GHS 500, one new plot × `pool_per_plot`) correctly added once pool-eligible was toggled on, landing at the expected GHS 1,500 total. All test data cleaned up afterward.

### B.10 -- Report builder section

Per the user's own ask: a filterable report generator covering every Accounting section (Payments/Expenses/Commission/Payroll), with a section picker and real date-range filters, downloadable as PDF. The already-catalogued `apache/superset` repo (`feedback-oss-foundation-strategy-2026-09-11`, flagged LOW literal-merge feasibility -- 1.1GB Python/Flask) is **UX/feature reference only**: its real concept of "pick a data source, pick dimensions/filters/date range, render a chart or table" is the shape to match, not its code. Built on the same real `pdfReport.ts` toolkit every other report PDF in this project already uses.

**DONE 2026-10-10.** `use-finance-reports.ts` (one real query per section, each reading live data scoped to the exact date range picked -- Commission loops `get_commission_breakdown()` across every month in range, Payroll joins `payroll_runs`/`payroll_run_lines` by period and nets earning/deduction lines per payee) + `reports-pdf.ts` (one builder per section plus a real income-statement-style Financial Summary combining all four: collected − expenses − commission − payroll = net) + `reports-panel.tsx` (section picker, quick-range presets -- this month/last month/this quarter/this year -- plus real custom from/to dates, a live preview, and a PDF download). New Reports tab, manager-only.

Verified live with real production data across the whole year (2026-01-01 to 2026-12-31): Financial Summary showed GHS 321,696.36 collected / GHS 10,535.34 commission / GHS 311,161.02 net; switching to the Payments section independently showed the identical GHS 321,696.36 across 13 real payments, and Commission independently showed the identical GHS 10,535.34 across 8 real agent-month rows -- confirming the cross-section totals agree with each other, not just that each screen renders something. All 5 report PDFs (Summary/Payments/Expenses/Commission/Payroll) downloaded cleanly with zero console errors, including Expenses and Payroll in their real current empty state (zero rows this year) to confirm the empty-data path doesn't throw.

## Part C -- Deliberately out of scope for this blueprint, not forgotten

- A full chart-of-accounts / general-ledger / double-entry layer (Bigcapital's real core strength) -- a materially bigger undertaking than anything asked for; Palmstead's real transactions are already categorized well enough for Part B.10's reports without it.
- Bank feed reconciliation (no bank API integration exists or was requested).
- Ghana tax-specific calculations (PAYE bands, SSNIT %) inside Payroll -- real research needed before any number is shown as authoritative tax guidance; Payroll's own deduction components (B.8) are free-text/manual amounts Management enters, not an auto-computed tax engine, unless/until this is explicitly asked for.
- Real-time cross-app sync beyond what already exists (the shared `useDashboardRealtime` channel) -- Payroll/Commission Calculator are new tables, so they're real candidates to add to that channel once built, not before.

## Part D -- After this blueprint (per the user's own explicit sequencing)

Once Accounting (Payroll + Commission Calculator + Settings + Report builder) is real and shipped: Operations Tracker reports system (staff + management, staff-to-staff comparisons, task reports, detailed filters) → Leave letters (re-analyze V1's real letter drafting/format, rebuild more professionally) → Leave reports → Attendance reports. Each gets its own real research pass before building, same discipline as this doc -- not started until Accounting is done.

## Sources

- V1 production `index.html` (main branch): confirmed zero salary/payroll mentions via direct grep, not assumed.
- `gh api repos/bigcapitalhq/bigcapital` (stars/language/push-date) and `gh api repos/bigcapitalhq/bigcapital/contents/packages/{server,webapp}/package.json` (real stack: NestJS backend, React+Redux+Formik webapp) -- read directly, not from its README or marketing pages.
- A GitHub code search for "payroll" inside `bigcapitalhq/bigcapital` returned zero results, confirming it has no payroll module (ruling it out as a payroll reference, in favor of ERPNext's real, well-documented Salary Structure/Payroll Entry/Salary Slip concepts already catalogued in this project's own OSS strategy memory).
- Real live schema (`sbydzrlzqxcdbudjaube`): confirmed `profiles` has no salary-adjacent columns and no `payroll`/`salary`-named table exists anywhere, before designing B.8's new tables.
- This project's own standing memory `feedback-oss-foundation-strategy-2026-09-11` (the 10 approved repos, including `frappe/erpnext` and `apache/superset`, both already catalogued there with real feasibility notes this blueprint builds on rather than re-deriving).
