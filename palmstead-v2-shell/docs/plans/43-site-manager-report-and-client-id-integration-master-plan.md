# Site Manager Report, Engagement Dashboard Drill-Down & Client-ID Cross-App Integration — Master Plan

Written 2026-10-31, in response to the user's own detailed message describing a vision for how
Site Visits, Site Visit Authorization, Pipeline, Accounting, Contract of Sale, Allocations, and
Plot Inventory should connect. **This is a plan only — no code was changed to produce it.** Every
claim below was checked against the real schema and real source files, not assumed.

**Read this first if you only read one thing**: the single biggest finding in this plan is that
the "Site Manager Report" the user described is **already substantially built** (`sve_day_reports`
/ `SveManagementScreen`'s "Day reports" tab — client feedback, two-stage AI analysis, manager
debrief questions, a day summary, PDF generation, and send-to-Management via SMS + in-app, all
real and working). The user may simply not know this feature exists, or may have only used the
"Client feedback" tab (which has no download, by design — only the compiled Day Report does). The
real gaps are three specific, missing *connections* to that existing report, not a rebuild. Treat
everything in §2 below as "extend this," not "replace this."

---

## 1. Real current-state findings

### 1.1 Site Manager Report / Site Visit Authorization — what exists, what's missing

**What already exists and works** (`src/webnext/features/sve-management/`, tables
`site_visit_experience_invites`/`_submissions`/`sve_day_reports`):
- A client feedback survey (ratings, NPS, purchase intent, free-text comments) sent to clients by
  real SMS after a visit, with a public submission form.
- A **Day Report** (`sve_day_reports`, one row per real `visit_date`) that already does almost
  exactly what the user described: a "client feedback" section per visitor pulled from the real
  submissions table, an AI pass (`sve_client_feedback_summary`) that summarizes each client's raw
  feedback, a set of real manager debrief questions per client (`SVE_REVIEW_QUESTIONS` —
  "meaningful questions based on the feedback," already real, already built), a free-text day
  summary field with a second AI pass to polish the manager's own writing
  (`sve_manager_narrative_polish`), a real PDF export (`buildSveDayReportPdf`), and a real
  send-to-Management flow (in-app notification + SMS with a public share-link, via
  `issueDayReportLink`/`get-sve-report` edge function).
- Real-time sync already wired (`useSveRealtime`, 4 tables).
- A hard gate (`canSubmit`) requiring every client to be reviewed and the day summary filled in
  before the report can be sent — matches the "no room for error" bar already.

**What's genuinely missing** (confirmed via schema — `sve_day_reports` has no attendance or cost
columns, `weekly_visit_forms` has no link to `sve_day_reports` or to individual clients, and
`site_visits`/`leads`/`payments` are never joined anywhere in this feature):

1. **No "who showed up vs. who booked" field anywhere.** `site_visits.status` exists but is a
   free-text scheduling status (`Pending`/`Completed`/etc. — not a real attendance flag), and
   nothing in `sve_day_reports.entries` (the per-client jsonb array) records attendance. The Day
   Report currently assumes every logged `site_visits` row for that date = someone who actually
   came.
2. **No connection to Site Visit Authorization's real cost data.** `weekly_visit_forms` (the
   vehicle rental/fuel/refreshment/T&T estimate-vs-actual form, one row per `(week_start,
   visit_date)`) and `sve_day_reports` (one row per `visit_date`) are **completely separate
   tables with no foreign key between them**, despite both being keyed to the same real date and
   the same real set of `site_visits` for that day. The Day Report has no budget section at all.
3. **No connection to Pipeline/Payments for conversion analytics.** Nothing anywhere computes
   "of the N people who visited this day, how many later bought, how much did we spend to get
   them there, which salesperson's visitors convert." `site_visits.lead_id` exists (added this
   session, Phase 5) so the join is *possible*, but nothing queries it this way yet.

### 1.2 Pipeline engagement dashboard — what exists, what's missing

`useEngagementDashboard.ts`/`useEngagementAnalytics.ts`/`useEngagementTrends.ts` (shared across
Pipeline, Client Database, Company Leads) already have a real period filter
(`EngagementPeriodFilterBar`, day/month/year granularity, "all" option) that re-scopes the whole
panel's 12 KPI tiles and 2 charts at once. **Confirmed via direct code check**
(`EngagementDashboardPanel.tsx`): there is **zero `onClick` anywhere on any tile** — the panel is
pure display. Changing the period filter changes the numbers; clicking a specific tile (e.g.
"Site visits in period") does nothing. This matches the user's complaint exactly: filtering by
day/week/month/year already exists at the *panel* level, but there's no way to click into a
specific metric and see the underlying real rows that produced it, for any period, present or
past.

### 1.3 Client-ID cross-app linkage — what's wired, what isn't

`leads.id` is already the real client identity most of the system keys off. Confirmed via direct
schema check — these tables **already have a real `lead_id` foreign key**: `payments`,
`contracts`, `contract_generations`, `contract_share_links`, `allocation_requests`, `site_visits`
(Phase 5), `enquiries`/`complaints`/`notes` (Phase 3). The two real gaps:

- **`plots` has no `lead_id` at all.** A plot's "owner" is recorded as free-text `client_name`/
  `client_contact` (set by `confirm_allocation`), not a real foreign key. This is the one broken
  link in the chain the user described (Pipeline → Allocation → Plot) — the plot, the actual
  physical asset, doesn't actually know which `leads.id` it belongs to.
- **`receipt_share_links` has no `lead_id`** (only `payment_id`) — a one-hop join away from the
  lead via `payments`, so not broken, just not direct. Low priority.
- **No cost-attribution table exists anywhere.** "How much has the company spent on this client"
  (the user's own ask) has no home today — site visit costs live in `weekly_visit_forms` (not
  per-client), banner costs live in `banner_status_log`/`banners` (not per-lead at all beyond the
  `leads.banner_id` attribution link), and nothing sums these per client.
- **The real receipt** (`buildReceiptPdf`, `src/webnext/features/payments/lib/receiptPdf.ts`)
  already prints a running balance snapshot (`paidAsOf`/`balanceAsOf`/`contractTotalAsOf`) but
  prints the auto-incrementing `receiptNumber` (e.g. `RCT-000004`) as the only identifier — **not
  the client's real `leads.id`** — and shows only the current balance, not an itemized list of
  previous payments with their own dates. Both are real, precise gaps matching the user's ask.
- **No automatic "allocation confirmed → contract preparation requested" trigger exists.**
  `confirm_allocation` (read in full this session) does not touch `contract_requests` at all.

### 1.4 Payment automation — what exists, what's missing, and an important discovery

**Important discovery — a real, separate, actively-developing Finance subsystem already covers
part of this.** Tables `finance_monthly_payment_schedules`/`finance_monthly_payment_installments`
(both with real `lead_id`) already implement a genuine per-client monthly payment plan: contract
total, deposit target, plan months, anchor day, SMS consent tracking (phone + consent timestamp,
correctly gated so reminders only go out with real consent), and a working cron pipeline
(`finance-monthly-reminder-queue` → `finance-monthly-reminder-sms-worker`, both in `pg_cron`
already) that sends a real "payment due in 7 days" SMS per installment. A separate
`finance-receipt-thank-you-sms` job already sends a thank-you SMS when a receipt is issued. This
is the concurrent session's own active work (confirmed: this exact subsystem was the reason
Phases 7-8 of the earlier sweep deliberately deferred Accounting/Vaults changes).

**What's genuinely still missing, even accounting for the above**:
- **No "missed payment" SMS** — only the 7-days-before-due reminder exists; nothing fires after
  an installment's due date passes unpaid.
- **No automatic schedule recalculation on overpayment, anywhere.** Confirmed by reading
  `approve_payment`'s full RPC body and `queue_finance_monthly_payment_reminders`: neither touches
  `due_amount`/`paid_amount` in a way that reflows future installments when a client pays more
  than one installment's worth at once. This is real, new work — not a bug, a missing feature.
  The user wants this done with **zero human involvement**, which is the single highest-risk ask
  in their whole message (see §5 Risk below).
- **No AI-drafted payment-change SMS anywhere** — the two-stage AI pattern used by Smart
  Insights/SVE (`ai-insights` edge function, a new `kind`) is the right reusable mechanism, but
  nothing calls it for payment events today.

---

## 2. Site Manager Report redesign

**Do not rebuild `sve_day_reports`/`SveManagementScreen` — extend it.** Three additive changes:

### 2.1 Attendance (who showed up vs. who booked)
Add a real attendance field. Simplest correct approach: a nullable `attended boolean` column on
`site_visits` itself (not buried in the Day Report's own jsonb — attendance is a fact about the
*visit*, and Site Visit Authorization/other consumers should see it too), defaulting to `null`
("not yet marked") until the site manager marks it. Surface a simple toggle/checkbox per client in
the Day Report's existing "Client-by-client" section (`DayReportEditor` in
`SveManagementScreen.tsx`) — no new screen needed. `canSubmit`'s existing gate should extend to
require every client marked attended/no-show before submission, matching the existing
"every client must be reviewed" discipline.

### 2.2 Budget reconciliation with Site Visit Authorization
Add a nullable `weekly_visit_form_id uuid references weekly_visit_forms(id)` to `sve_day_reports`
(both tables already key off the exact same `visit_date`, so the join is a straightforward lookup
by date at report-creation time, same `getOrCreate` pattern `weekly_visit_forms` itself already
uses). Once linked, the Day Report editor can show a real, computed budget section: total spent
(sum of the linked form's real `*_act` columns, already a proven figure — this is the exact same
number Phase 7 of the earlier sweep already wired into Accounting Expenses), average spent per
attended client (total ÷ count of `attended = true` entries, not total visitor count — the
company only spent transport/refreshment money on people who actually came), and the existing
fuel/refreshment/etc. breakdown rendered directly from the linked form rather than re-entered.
This is the real "reconcile between the budget and the reality on ground" the user asked for —
the estimate-vs-actual gap already computed by `weekly_visit_forms` becomes visible on the same
screen as who the money was actually spent on.

### 2.3 Conversion-rate analytics (Pipeline + Payments sync)
This is pure read-side analytics, additive, no schema change required beyond what Phase 5 already
added (`site_visits.lead_id`). Add a new section/tab to the Day Report (or a new lightweight
screen, since this is more "a report Management reads" than "a thing the site manager fills in" —
recommend a new tab on the existing `SveManagementScreen`, e.g. "Conversion," rather than cramming
it into the per-day editor) that, for a chosen period, computes per salesperson: visitors brought
(via `site_visits.agent_key`), of those, how many have a real `leads.id` match, of those, how many
later had `amtPaid >= grandTotal` (the existing "purchased" definition already used by
`useEngagementDashboard`'s `boughtClients` metric — reuse it, don't invent a second one), and the
real site-visit cost attributed to that salesperson's visits (via the §2.2 link) divided by
converted clients = a real cost-per-conversion figure. This single feature answers the user's
"which salesperson is converting their site goers and who isn't."

---

## 3. Pipeline engagement dashboard drill-down

The period filter already exists and is correctly wired (day/month/year, "all"). What's missing is
purely interaction: make each of the 12 `EngagementDashboardPanel` tiles clickable, opening a
real list of the underlying rows for that metric within the currently-selected period (present or
past — the existing period filter already supports arbitrary historical ranges, this just needs to
expose the *rows*, not only the *count*). Concretely: a shared `EngagementDrillDownSheet` (or
reuse an existing modal/sheet primitive already in `src/components/ui/`) that takes the metric key
+ current period + the already-fetched `leads`/`activity`/`visits`/`payments` arrays
(`useEngagementDashboard` already computes exactly which rows matched each metric inside its own
`useMemo` — the hook needs to also *return* those filtered arrays, not just their counts, which is
a small, low-risk change to one function, not a new data-fetching path). No new queries needed;
this is almost entirely a UI change plus one hook returning slightly more of what it already
computes.

---

## 4. Client-ID-centric cross-app integration architecture

### 4.1 Make `plots` client-ID-aware
Add `lead_id uuid references leads(id)` to `plots`, set by `confirm_allocation` alongside the
existing `client_name`/`client_contact` (keep those too — don't remove a working free-text
fallback for the rare plot that gets allocated outside the normal flow). This closes the one real
broken link in Pipeline → Allocation → Plot.

### 4.2 A real per-client cost-attribution ledger
New table, e.g. `client_cost_attributions`: `id, lead_id, source_type (text: 'site_visit' |
'banner' | ...), source_id uuid, amount numeric, note text, created_at`. Populate it
incrementally, not retroactively-all-at-once: once §2.2's site-visit-cost-per-client figure
exists, insert a row per attended client per site-visit day; banner-sourced leads could get a
rows based on the banner's own cost data if that's ever tracked (it currently isn't — banners has
no cost field today, confirmed; out of scope unless the user wants banner cost tracking added
too). This directly answers "how much the company has spent on that client" without having to
reverse-engineer it from five different tables every time someone asks.

### 4.3 Receipt redesign
Add the real `lead_id` (or a short, human-friendly client reference derived from it, e.g. the
first 8 characters — match whatever display convention the user prefers, confirm with them before
building) to `buildReceiptPdf`'s printed output, alongside the existing receipt number. Add a real
itemized payment history table below the existing balance summary — `ds.payments.listForLead(
leadId)` already exists (built in an earlier phase) and returns exactly the rows needed, sorted by
date, each with its own real date stamp — this is a rendering change to the existing PDF builder,
not a new data path.

### 4.4 Allocation-confirmed → contract-preparation auto-request
When `confirm_allocation` succeeds, insert a row into `contract_requests` for that lead
automatically (the real table Contract of Sale's own request-fulfillment flow already reads from
— no new table needed). This is a small, safe addition to an RPC already read in full this
session: one more `insert into contract_requests (...)` inside the same transaction, after the
existing `plots`/`allocation_requests` updates, following the same "a real RPC fans out to every
real consequence in one transaction" pattern `approve_payment` already demonstrates.

### 4.5 "Airtight but each staff keeps their own identity" — the real tension, named honestly
The user's ask here is really two things that can pull against each other: (a) more
cross-referencing of data (client IDs linking everything), and (b) RLS/role-scoping staying
correct so one staff member's own data doesn't leak into another's view. These are **not in
conflict** if done correctly: adding `lead_id` to `plots`, or a cost-attribution row, or an
auto-inserted `contract_requests` row, does not change *who can see* that data — RLS continues to
gate by `agent_key`/role exactly as it does today, regardless of how many tables a given
`lead_id` now appears in. The real discipline needed going forward (already the standing rule this
session established in the master audit plan): **every new cross-app read must still respect the
same RLS the underlying tables already enforce** — a drill-down view, a conversion report, a
cost-attribution query must all be built as views/queries *on top of* RLS, never as a
`service_role`-bypassing shortcut "for convenience." Nothing in this plan requires or proposes
bypassing RLS anywhere.

---

## 5. Payment automation — design, with an explicit risk flag

### 5.1 Missed-payment SMS
Mirror the existing `finance-monthly-reminder-queue`/`-sms-worker` pattern exactly: a new
`queue_finance_missed_payment_reminders()` function (same shape as the existing "due in 7 days"
one, but `installment.due_date < current_date and installment.status in ('scheduled',
'part_paid')`), a new outbox table or a `reminder_type` column added to the existing
`finance_monthly_payment_reminder_outbox`, and a new cron entry. This is low-risk, additive, and
belongs in the Finance subsystem (coordinate with the concurrent session before building — this
touches their active tables).

### 5.2 Overpayment auto-recalculation — real risk, proposed safer design
**The user explicitly asked for this to happen "without any human interference."** Read
literally, that means: a client pays more than scheduled, the system silently rewrites their
entire future payment schedule and texts them a new plan, with no manager ever seeing it before it
goes out. **This plan recommends against building it exactly that way**, and explains why rather
than silently deviating: this is real client money and a real legal payment schedule — a
mis-computed recalculation (e.g. a double-counted payment, a race between two near-simultaneous
payments, an edge case in how a partial-installment overpayment should roll into the next one) sent
directly to a client with no review is the kind of mistake the user's own message says "no room
for" and worries could have serious consequences. **Proposed middle ground, which still removes
the human from the *normal* path**: the system auto-detects an overpayment (payment amount minus
remaining due on the current installment, where that remainder is positive), auto-computes the
proposed new schedule, and auto-drafts the AI explanation — all without a human doing any of that
calculation — but holds it as a real pending state (e.g. `finance_monthly_payment_schedules.status
= 'recalc_pending'`) with the proposed new numbers visible to Management, requiring exactly one
tap to confirm before the SMS goes out. This keeps 95% of the manual work gone (no one does the
math, no one drafts the message) while keeping one real human checkpoint before money-schedule
changes reach a client. If the user, after seeing this reasoning, still wants it fully automatic
with zero review, that should be a deliberate choice made after this tradeoff is understood — not
the default this plan builds toward.

### 5.3 The AI's real job
Reuse the exact two-stage pattern already proven in SVE (`ai-insights` edge function, a new `kind`
e.g. `payment_schedule_change_sms`): the *system* computes the real new schedule numbers
(deterministic math, not AI — AI should never compute money), and the AI's only job is turning
"here are the old numbers, here are the new numbers, here's why" into a clear, warm, plain-English
SMS, following the same redaction discipline (`redactPII`) already used everywhere else AI touches
client data in this codebase.

---

## 6. Phased execution plan

Ordered by real dependency — each phase is independently testable, matching this session's own
established discipline (typecheck clean, live or substitute-verified, committed before moving on).

**Phase A — Engagement dashboard drill-down** (§3). Self-contained, no schema change, lowest risk,
highest immediate visible value. Good first phase.

**Phase B — Site Manager Report: attendance field** (§2.1). One column, one UI toggle, extends an
existing gate. Low risk.

**Phase C — Site Manager Report: SVA budget link** (§2.2). One FK column + a read-side join +
new UI section on an existing screen. Low risk, no money is written, only reconciled/displayed.

**Phase D — Conversion-rate analytics tab** (§2.3). Pure read-side, reuses existing "purchased"
definition. Low risk.

**Phase E — `plots.lead_id` + receipt redesign** (§4.1, §4.3). Two independent, additive changes;
bundle them since both are "client ID becomes visible/linked where it wasn't," but verify
separately. Receipt change needs real visual review (a PDF a real client receives) before
considering done.

**Phase F — Allocation → contract-request auto-trigger** (§4.4). One RPC addition, carefully
tested (confirm it doesn't create duplicate `contract_requests` rows if an allocation is
reconfirmed/edited — check the real uniqueness/idempotency the table may or may not already
enforce before writing the trigger).

**Phase G — Cost-attribution ledger** (§4.2). New table + the first real population path (site
visit costs, once Phase C exists to source the per-client figure from).

**Phase H — Missed-payment SMS** (§5.1). **Coordinate with the concurrent Finance session before
starting** — this touches their active tables/outbox pattern directly.

**Phase I — Overpayment recalculation (safer design)** (§5.2, §5.3). The highest-risk, most
valuable phase. Needs explicit user sign-off on the "one-tap confirm" middle ground (or their
informed choice to go fully automatic) before any code is written. **Coordinate with the
concurrent Finance session** — same reason as Phase H.

---

## 7. Open questions for the user, before execution begins

1. Receipt client-ID display: print the raw `leads.id` (a full UUID, not very readable) or a
   shorter derived reference? If shorter, what format (first 8 chars? a new sequential
   "client number" minted once per lead, similar to how `receiptNumber` already works)?
2. Phase I: confirm the one-tap-confirm middle ground is acceptable, or that fully automatic
   (zero review) is genuinely wanted despite the risk explained in §5.2.
3. Phases H and I both depend on coordinating with whoever is running the concurrent Finance
   session — should that happen before this plan's execution starts, or should Phases A-G proceed
   first while that coordination happens in parallel?
