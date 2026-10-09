# Finance — Build Blueprint (replaces Log Payment + Expenses)

**Status: real schema/RLS/calculation fully audited against the live database before writing this. No new core tables needed -- payments, expenses, expense_categories, recurring_expenses, and a real monthly commission calculation all already exist, correctly built, with zero frontend. This is almost entirely a UI-and-reusable-logic build, not a schema build.**

Source for architecture/technical layers: `midday-ai/midday` (github.com/midday-ai/midday, 15K stars, Next.js + Supabase + TypeScript + Tailwind -- the one stack-matched real accounting app found, not a PHP/Laravel repo that would need a full rewrite to adapt). Real screen taxonomy confirmed by reading its actual file tree (`apps/dashboard/src/app/[locale]/(app)/(sidebar)/`): `transactions`, `invoices`, `reports`, `customers`, `vault`, `tracker`, `settings`. Palmstead's own real equivalents below are adapted from this shape, not copied wholesale -- midday is a full Turborepo monorepo (separate API service, desktop app) which doesn't fit duplicating whole-cloth into this single Next.js shell; what's real to adapt is its dashboard app's own screen/layout patterns and its financial-overview visual language (UI reference also drawn from Pinterest/Dribbble per the user's instruction, to be done alongside each screen, not applied as an upfront moodboard divorced from the build).

V1 logic read directly from `index.html` (main branch) as the primary business-requirements source, not guessed:
- `PAYMENT_METHODS = ['Ecobank','Stanbic Bank','MTN MoMo','Vodafone Cash','Hubtel','Cash','Other']`.
- `apiInsertPayment`: payments are always attributed to the **lead's own assigned agent**, never whoever is physically logging it (payment entry is Elias/Management-only in V1, but the client's own agent must still see it in their own ledger) -- looked up fresh from the lead, not trusted from a stale in-memory copy. Status defaults differently depending on who's logging: Management logs land `approved` directly; a non-manager logger's entry lands `pending` so money can't reach a client's balance until reviewed. An offline mutation queue exists (payments attempted with no connection queue as `pending` and apply their real balance effects once back online, re-using the same `approve_payment` RPC path) -- real, but a V1-specific resilience feature for field conditions; not reproduced here unless the user asks, since this build runs on a stable office connection.
- A hard architectural rule, confirmed by a real comment in `apiInsertPayment`'s neighborhood: a lead's `amtPaid`/`balance` running totals must stay in **exact lockstep** with the itemized `payments` ledger on every correction or deletion -- "letting them drift apart is what let a deleted test payment keep feeding real financial figures" (the exact incident flagged in this project's own memory, `pipeline-payment-integrity`). Every Finance write path in this plan must go through the same real `approve_payment`-equivalent RPC logic, never a bare client-side `update` on `leads.amt_paid`.
- Commission: **already a real, live, correct calculation** -- `run_monthly_commission_check()` (confirmed via `pg_get_functiondef`, runs daily at 6am, posts to the real `announcements` table once a month after the 15th). Real formula, config-driven via `app_config` (`full_price`/`half_price`/`commission_full_cap`/`commission_half_cap`/`commission_pool_per_plot`): personal commission is `cap * (amount paid that month / plot price)` per payment, summed per agent; a separate newcomer pool (`pool_per_plot * plots newly first-paid this month`) is split evenly among agents whose first payment landed in the last 3 months. This is the real, already-correct source of the historical "Commission ready: Jul 2026"/"Commission ready: Jun 2026" announcements found live in Announcements (B.2) -- proof this calculation has been running correctly in production already. **No new commission math gets written** -- the existing formula is extracted into one reusable `get_commission_breakdown(report_month)` function both the existing cron job and the new UI call, so there is exactly one source of truth (closing the exact class of drift the past incident was caused by), not two copies that could diverge.
- Expenses: real V1 schema already matches the real V2 table almost exactly (`category`, `amount`, `expense_date`, `payment_method`, `description`, `receipt_data`/`receipt_name`, `status`/`decided_by`/`decision_note` approval workflow, `fund_request_id`). `recurring_expenses` (`interval`, `day_of_period`, `last_reminded_period`) already has a real cron-reminder shape too -- confirmed a real `send_site_visit_reminders`/`send_leave_reminders`-style job would be the pattern to extend for recurring-expense-due reminders, not built new from scratch in this phase (flagged in Part C below, not core).

---

## Part A -- Foundation

### A.1 Permission model

Payments and expenses already gate through the real `has_permission()` system (A.1 from the General Staff Portal plan, same infrastructure): `payments.manage` (insert/update/delete on payments -- currently granted to Elias + manager, confirmed live) and `ops.view_all` (cross-staff payment visibility -- Elias/Emmanuel/Elizabeth + manager). Expenses use a simpler own-row-or-manager rule, not the permission table yet -- if Management wants to restrict who can log expenses, that becomes a new `expenses.manage` permission key, same mechanism, not built until asked for (today everyone can log their own expenses, matching the real RLS already live).

### A.2 Real reusable commission function (the one real net-new piece of backend logic)

```sql
create or replace function public.get_commission_breakdown(p_month text)
returns table (agent_key text, agent_name text, personal numeric, pool_share numeric, total numeric, is_pool_eligible boolean)
...
```

Extracted verbatim from `run_monthly_commission_check()`'s own CTEs (same `first_payment`/`personal`/`newplots_this`/`eligible`/`agents`/`pool` logic), parameterized by month instead of hardcoded to "last month," returning real per-agent rows instead of only a posted summary. `run_monthly_commission_check()` itself gets refactored to call this function and use its `grand_total`/`agent_count`/`eligible_count` for the announcement text, rather than keeping two copies of the same math.

### A.3 Navigation

One new "Finance" app (`/dashboard/finance`), replacing the two still-`NOT_BUILT_YET` sidebar entries "Log Payment" and "Expenses" with a single real entry. Internal tabs, Staff vs Management content differing per tab (not two separate screens -- same real pattern Operations Tracker's Command Center already uses: `has_permission`/role gates sections within one page, not a parallel app):

| Tab | Staff sees | Management sees |
|---|---|---|
| Overview | Their own collected/outstanding this month | Real company-wide collected/outstanding/expense burn, same KPI-card language as `dashboard/default`'s own `MetricCards` |
| Payments | Their own leads' payment ledger, log a new payment (lands `pending` unless they hold `payments.manage`) | Every payment, approve/decline queue, correction audit trail |
| Expenses | Their own logged expenses + receipts, submit new | Every expense, approve/decline queue, category budgets vs actual |
| Commission | Their own real breakdown for the selected month (via `get_commission_breakdown`) | Every agent's breakdown, pool detail, the same table the monthly announcement already summarizes |

### A.4 Receipts

`expenses.receipt_data`/`receipt_name` and `payments.receipt_proof_path` already exist. Real file upload goes through Supabase Storage (same pattern as Attendance's real photo pipeline, `attendance_photos` -- a proven real upload path in this codebase already, not invented fresh).

---

## Part B -- Screens (build order)

1. **Payments** (the explicitly-named "Log Payment" replacement) -- log a payment against a real lead, real approval queue, real ledger view. Builds first since it's the one named by name.
2. **Overview** -- the real financial dashboard, built once Payments + Expenses both have real data flowing, so its KPIs aren't empty shells.
3. **Expenses** (the explicitly-named "Expenses" replacement) -- submit/approve, category budgets, recurring expenses list.
4. **Commission** -- real per-agent breakdown via the new `get_commission_breakdown`, both the monthly cron's own month and a real month picker for history.

## Part C -- Deliberately deferred, not forgotten

- Recurring-expense due reminders (real cron pattern exists to extend, `send_site_visit_reminders` is the template) -- separate real slice once the core Expenses screen ships.
- Offline mutation queue for payments (V1's own field-conditions resilience feature) -- not needed for an office-connection-only V2 session, revisit if real field use surfaces the need.
- A real `expenses.manage` permission key, if Management wants to restrict expense logging beyond "own rows only" (today's real RLS).

## Sources

- `midday-ai/midday` real file tree (`apps/dashboard/src/app/[locale]/(app)/(sidebar)/`), read directly via the GitHub API, not assumed from its README.
- V1 production `index.html` (main branch): `apiInsertPayment`/`apiDecidePayment`/`apiUpdatePayment`/`apiDeletePayment`/`queuePaymentInsert`, `PAYMENT_METHODS`, and the real comment documenting the amtPaid/ledger lockstep rule, read in full around lines 4187-4260.
- V2's own real live schema (`sbydzrlzqxcdbudjaube`): `payments`/`expenses`/`expense_categories`/`recurring_expenses`/`payment_reminders_log` tables, their real RLS policies, `run_monthly_commission_check()`'s real function body, and `app_config`'s real commission-rate columns -- all queried directly, not assumed.
- **Not yet done**: live Pinterest/Dribbble UI research for each screen's actual visual treatment (to be done screen-by-screen during Part B, not as a single upfront pass divorced from the real build, per the user's own "take UI reference from Pinterest, then use it to design the UI" instruction).
