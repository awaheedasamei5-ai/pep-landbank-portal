# Batch 4 — Accounting, Contract of Sale, Quotation, Commission

Full test sweep + cross-app sync analysis, 2026-10-30. Tested live as Adams
(agent) and Management against the real dev server and real
`sbydzrlzqxcdbudjaube` data.

## Functional testing

**Accounting** (`/dashboard/finance`) — all 12 tabs (Overview, Payments,
Installments, Expenses, Commission, Payroll, Vaults, Budgets, Requests,
Vendors, Reports, Settings) tested as both roles. Role-gating correct
throughout: Adams correctly blocked from Payroll/Vaults/Vendors/Settings
("visible to Management only" / "Finance access is required"); Management
sees company-wide numbers plus every gated tab. No console errors. Payroll's
roster and Settings' staff pickers both correctly pull the real, live 8-person
staff list automatically — a genuine working sync (Directory/profiles →
Accounting), not a silo.

**Contract of Sale** (`/dashboard/contract-of-sale`) — Generate, Drafts,
Requests, Vault, Templates, Reports tested as both roles. **Real bug found
and fixed** (see below). Vault correctly shows "No contracts generated yet"
for the v3 `contract_generations` path (0 rows — nothing has used this path
yet; see gap #1 below for why).

**Quotation** (`/dashboard/quotation`) — tested as Adams. Live math verified
correct (48,000 net → 12mo plan → 3,000 interest → 51,000 grand total → 14,400
deposit (30% of net) → 36,600 balance → 3,050/month × 12 = exact payoff). No
console errors. Explicitly a pure calculator: "Live pricing — nothing saved,
nothing sent" — confirmed zero persistence to any table (see gap #4).

**Commission** (`/dashboard/commission`) — tested as Adams. Confirmed this
standalone route and Accounting's embedded Commission tab render the exact
same component against the exact same data (identical GHS 0.00, identical
"Pool: 3 months no sale" text) — genuinely shared logic, not two divergent
implementations. No fragmentation risk here.

## Real bug found and fixed

**`contract_templates_sel` / `contract_template_versions_sel` RLS hardcoded
to manager + `elizabeth` only**, never routed through `has_permission()` —
identical bug class to the `weekly_visit_forms` fix from an earlier batch
this session. `ContractGeneratorScreen.tsx`'s real "Generate" flow calls
`useContractTemplates()`, a direct `.from("contract_templates")` select
subject to RLS — so any other staff member (Adams, Bridget, Emmanuel, Elias,
Philip) could open the Generate screen but would get zero templates back,
silently blocking contract generation. **Fixed**: widened both `_sel`
policies to `auth.uid() is not null` (same temporary, already-established
testing-phase pattern as `contract_requests_upd`/`weekly_visit_forms`
earlier this session — authoring policies `_ins`/`_upd` left untouched,
still manager/elizabeth only). Verified live: Adams now sees both the
published "Standard Contract of Sale" v2 template and the "dev" v1 draft on
`/dashboard/contract-of-sale/templates`, where before the fix the page showed
"No contract templates yet."

## Security

All other RLS reviewed (payments, contracts, contract_requests,
contract_generations, contract_share_links, finance_vaults, finance_budgets,
finance_vendors/bills, payroll_*) looked sound and consistent with the
already-documented `has_permission()` testing-phase override. No other
hardcoded gaps found in this batch.

## Realtime

`payments`, `contracts`, `contract_templates`, `contract_template_versions`,
`contract_generations`, `contract_requests` all confirmed in the
`supabase_realtime` publication and wired into `useDashboardRealtime.ts`.

**Gap noted, deliberately not touched**: none of the newer Finance tables
(`finance_vaults`, `finance_budgets`, `finance_vendors`,
`finance_vendor_bills`, `finance_vendor_payments`, `finance_vault_journals`/
`_lines`, `payroll_runs`/`payroll_run_lines`/`payroll_staff`/
`payroll_salary_components`) are in the realtime publication at all. Same
reasoning as the `op_todos` item from an earlier batch: these are a
concurrent session's own actively-developing feature set (migrations dated
2026-10-27/28, merged into this branch mid-sweep) — wiring their realtime is
that session's own next step, not this sweep's to take.

## Data quality

No obvious structural issues found in the tables reviewed (payment/contract
reconciliation already explained in `docs/plans/34-pipeline-retroactive-plan.md`
— `leads.amt_paid`/`balance` are independent snapshot columns, not derived
from `sum(payments)`, by original V1 design; not re-flagged here as a new
bug). Vendor/budget/vault tables are all genuinely empty (feature just
shipped), nothing to reconcile yet.

## Cross-app sync mapping — the deep part

### 1. Contract of Sale's two parallel "contract" concepts are disconnected

**Real shared entity**: a generated Contract of Sale for a lead.

**Current state**: there are two separate real tables representing "a
contract": the legacy `contracts` (8 real rows, including the 5 migrated
from V1 this session — `lead_id`, `client_name`, `agent_key`,
`created_by`/`created_by_name`/`created_at` only, no PDF) and the v3
`contract_generations` (0 rows — `pdf_storage_path`, `content_snapshot`,
`field_values_snapshot`, full real generation metadata). Pipeline's own
`ContractStatusSection` (the tab every lead detail page shows) reads/writes
`contracts`. The *new, dedicated* Contract of Sale app's Vault/Reports/
Requests/Drafts screens all read `contract_generations` exclusively. The
practical result: **the 8 real legacy contracts — including every one of
this session's own V1-migrated contract records — are completely invisible
inside the Contract of Sale app's own Vault and Reports**, visible only via
the older Pipeline tab. A Management user browsing the Contract of Sale app
looking for "every contract ever issued" (the Vault's own stated purpose)
would see none of the 8 real ones that exist.

**Concrete fix to evaluate**: either (a) migrate the 8 legacy `contracts`
rows into `contract_generations` with a null/placeholder `pdf_storage_path`
so they at least appear in the Vault/Reports list, or (b) have the Vault/
Reports queries union both tables, or (c) formally deprecate the legacy
`contracts` table path in Pipeline in favor of always writing
`contract_generations` going forward (requires `useSendContractToClient.ts`
and the Pipeline `ContractStatusSection` flow to be migrated onto the v3
schema). This is a real architectural decision, not a one-line fix — flagged
for the parent session/user to choose a direction.

### 2. Site Visit Authorization actual-costs → Accounting Expenses: confirmed real gap

Following up on the item flagged in `docs/plans/35-cross-app-sync-findings-batch2.md`
(#3): **confirmed live**. Accounting's Expenses tab shows "No expenses logged
yet" for Adams despite real `weekly_visit_forms` rows existing with non-zero
`*_act` cost columns (verified several times this session, e.g. driver's tip/
fuel/refreshment/transport actuals on multiple migrated and live rows). These
real logged field costs have no path into Accounting's expense ledger at
all — a day's real site-visit spending exists only as a number on one
Site Visit Authorization screen, never reconciled anywhere else.

**Concrete fix**: when a `weekly_visit_forms` row's status moves to
finalized/approved, insert a corresponding `finance_vendor_bills`-style
entry or a dedicated `accounting_expenses` row (whichever shape the real
Expenses tab actually reads from — confirm via `src/app/(main)/dashboard/
finance/_components/` before building) with category "Site Visit
Logistics", amount = sum of the `*_act` columns, and a reference back to the
`weekly_visit_forms.id`. A database trigger on `weekly_visit_forms` UPDATE
(status transition) is the cleanest mechanism — matches the trigger-based
fan-out pattern already used elsewhere in this codebase (e.g.
`approve_payment`'s own multi-table fan-out).

### 3. Accounting's own treasury (Vaults) explicitly admits it doesn't reconcile against real payments/expenses

The Vaults tab's own real UI copy states this directly: *"Recorded bank and
cash balances. Existing client payments and expenses have not been imported
or reconciled into this ledger."* This is the app's own developers already
flagging the same class of gap as #2 above, at the treasury level instead of
the expense-category level — real client payments (GHS 192,196 collected
company-wide this period, confirmed on the Overview tab) have no linkage to
any real bank/cash vault balance. A Head of Finance manually posting
"opening balances" and "bank-to-cash movements" is the only way money
enters this ledger today; it never auto-updates from the real Payments
table.

**Concrete fix to evaluate**: a real approved payment could post an
automatic "pending reconciliation" line into the relevant vault (or a
holding/suspense vault) rather than requiring 100% manual entry — reduces
exactly the kind of manual re-entry the user's stated goal wants eliminated.
This is a real design decision (how strict should treasury reconciliation
be?) best made by the user/Head-of-Finance role, not auto-built — flagged,
not fixed.

### 4. Quotation has zero persistence or lead linkage — by design, but worth confirming that's wanted

**Real shared entity**: none, currently — that's the finding. Quotation is a
pure client-side calculator; filling in a customer's name/contact/email and
downloading a PDF creates no `leads` row, no `activity_log` entry, nothing
a Pipeline user would ever see. If a prospect gets a quotation and doesn't
immediately become a tracked lead through a separate manual Add Lead action,
that interaction is lost to the system entirely — no record it ever
happened.

**Concrete fix to evaluate**: add an optional "Save as lead" action on the
Quotation screen that, given the customer fields already being typed in,
inserts a real `leads` row (stage = earliest/Discovery, `lead_source` =
"Quotation") — turns a disconnected calculator into a real top-of-funnel
entry point, consistent with the user's stated goal of apps populating each
other automatically. This is new UX, not a bug fix — flagged for the plan,
not built here.

### 5. Commission (confirmed working, no gap)

Commission's own math already reads real `payments`/`leads` data (the same
underlying tables Accounting and Pipeline use) through one shared component
rendered in two places — already a correct, DRY cross-app sync, nothing to
fix.

## Summary of action items for the master findings document

1. Reconcile the legacy `contracts` vs v3 `contract_generations` split
   (architectural decision needed).
2. Wire Site Visit Authorization actual-costs into Accounting's Expenses
   ledger via a real trigger (buildable now, clear mechanism).
3. Consider automatic payment→vault reconciliation (design decision
   needed).
4. Consider a "Save as lead" action on Quotation (new UX, clear value).
5. (Informational only, not this session's to fix) Finance's newer tables
   need realtime wiring — that's the concurrent session's own next step.

No further code changes made this batch beyond the one RLS fix documented
above (money/legal domain — stayed conservative per instructions).
