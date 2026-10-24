# Analytics — build plan (palmstead-v2-shell)

Sixth of 7 apps in the "Insights" build order. This is the one item the 2026-10-23 research memo flagged as genuinely fuzzy ("what unique value a *staff*-facing Analytics view should show isn't settled"). That question is now resolved from v1's own source, not guessed — see §0.

## 0. Resolving the scoping question from real v1 source

`index.html:9225-9227`, a real code comment on `viewInsightsHub()`:

> "the sidebar's Insights/Management top-level items land here (**manager only**; agents route straight to Smart Insights, their only real Insights destination)"

Confirmed two more ways in the same file:
- `viewMore()` (index.html:9254-9283) builds a completely different tile set per role. The agent branch (line 9267-9282) only ever offers **Smart Insights** and **Portfolio** under its "Insights" group — Analytics, Reports, Data Check, Commission, Leaderboard, Report Archive never appear there. The manager branch is the only one that ever lists Analytics.
- `viewInsightsHub()`'s own items list (line 9233) — `['Analytics','Reports','Management Reports','Report Archive','Insights','Commission']` — is built exclusively from `MGR_APPS`, the manager-only app registry.
- `mgrTab==='Analytics'` (index.html:19480) routes to `route('mgmtreports','overview')` — Analytics is literally one of four aliases (`Analytics`/`Reports`/`Management Reports`/`Report Archive`) that all land on the same manager-only unified Reports hub, consolidated from four originally-separate screens (index.html:23431-23435 comment).

**Conclusion**: Analytics has zero staff-facing meaning anywhere in v1. It is purely a manager destination. This shell's sidebar "Insights" group is shared nav (shown to both roles, same as every app in this queue so far), so the honest build — same inverse pattern already used for My Portfolio's manager branch and Commission's manager branch, just flipped — is:
- **Manager** gets the real thing: `mgrAnalytics()` (index.html:20339-20394), a genuinely new, not-yet-built-anywhere-in-this-shell unified live dashboard.
- **Staff** gets a plain v1-parity redirect to Smart Insights, their real Insights destination, exactly matching the source comment above.

## 1. What `mgrAnalytics()` actually renders (index.html:20339-20394)

A single live dashboard combining numbers that in v1 are otherwise spread across Overview/Expenses/Pipeline Health/the PDF-only Management Report:

1. **KPI row**: Revenue this month, Outstanding, Fully paid count, Net position.
2. **Revenue trend**: line chart, last 6 months, all agents, real `payments` data.
3. **Pipeline composition**: donut — Committed (paying, `amt_paid>0`) vs Prospects (unpaid), by value, restricted to *active* leads (not fully paid, stage ≠ Lost) — plus a health label (Healthy / Fair — needs conversion push / Weak — mostly unpaid prospects) driven by the unpaid share.
4. **Payments by method**: donut, this month, grouped by `payment_method`.
5. **Top agents**: top 5 by revenue collected this month (not pipeline value — a different cut from the Home dashboard's `byAgent`), with each agent's new-lead count for the month.
6. **Net position card**: cash-basis this month (payments minus approved expenses), with the explicit caveat v1 states plainly ("Does not include commission payouts, which aren't logged as a cash outflow yet") — carried over verbatim, since it's a real, still-true limitation of the underlying data, not a built-vs-not-built gap for this app to fix.
7. A plain-text link to the full Reports hub for a downloadable PDF/Excel export — in this shell, the equivalent destination is the already-shipped Accounting → Reports tab (`/dashboard/finance?tab=reports`), reused rather than re-described.

## 2. Database

None. Every number above is computable from tables already live and already read elsewhere in this shell:
- `leads` (`agent_key, grand_total, amt_paid, stage, deleted_at`) — same columns `useManagerOverview` already selects.
- `payments` (`amount, payment_date, payment_method, agent_key, status`) — confirmed via `information_schema.columns` this session; `payment_method` is the real column name (v1 calls it `method`, this shell's schema already renamed it, same as every other port in this queue has had to reconcile a renamed column).
- `expenses` (`amount, expense_date, category, status`) — confirmed live, same columns the Accounting Expenses panel already reads.
- `profiles` (`agent_key, name, active`) for the agent-name join.

## 3. Security

None new. Every query here already runs successfully as a manager session elsewhere in this shell (`useManagerOverview`'s own comment: "a real manager-role session gets unrestricted SELECT on leads/payments/complaints via RLS itself" — confirmed live 2026-08-29, unchanged since). The route itself is the only new access boundary, and it's enforced client-side the same way My Portfolio's and Commission's manager/staff branches already are (role read from `useAuthStore`, not a new RLS policy) — consistent with the rest of this queue, since every actual data read underneath is already correctly scoped.

## 4. AI touchpoints

**One real, already-live-on-the-server capability, never wired to any screen in this shell**: `manager_daily_briefing` (confirmed live on the `ai-insights` Edge Function, `sbydzrlzqxcdbudjaube`, via `get_edge_function`). Its own system prompt describes exactly this data shape — "today's real company-wide numbers: total leads, outstanding balance, fully-paid count, open complaints, total pipeline value, site visits logged, this month's collected amount and its trend vs last month, the pipeline stage funnel, and a ranked list of agents by their pipeline value" — which is, field-for-field, `useManagerOverview`'s own return shape. This was clearly built to back a dashboard exactly like this one and simply never got one. Wiring it here is a real gap closed, not new AI surface-area invented for its own sake: a 2-3 sentence chief-of-staff briefing at the top of the page, reusing `useManagerOverview`'s already-fetched data as the AI call's context, same graceful-null-on-unconfigured pattern as every other AI hook in this shell (`useLeaderboardGapCoach` is the closest structural twin — same "compute real numbers first, AI only narrates them" split).

No other new AI work — `commission_explainer` and `leaderboard_gap_coach` already live on their own apps; duplicating a narration of the same revenue number a third way would be exactly the redundant-AI-surface the Commission plan already declined to do.

## 5. UI — page architecture

**One real page**, not artificially split — same reasoning already used for Data Check and Commission in this exact queue: v1's own `mgrAnalytics()` is itself one scrollable view (KPIs → trend → two donuts → top agents → net position), not several screens stitched together, and there is no second natural destination to carve out here. Splitting it into fake sub-pages would be padding, not structure.

```
/dashboard/analytics   Manager: the real unified dashboard below.
                        Staff: v1-parity redirect card pointing to
                        Smart Insights (/dashboard/smart-insights) --
                        the exact inverse of My Portfolio's and
                        Commission's manager-side redirect, now
                        correctly applied to the one app in this queue
                        where v1 draws the access line the other way.
```

### Manager view, top to bottom
1. **AI briefing strip** — `manager_daily_briefing` sentence, skeleton while loading, silently absent if unconfigured (never an error state blocking the rest of the page).
2. **KPI row** — 4 cards: Revenue this month, Outstanding, Fully paid, Net position. Real shadcn `Card`, same density as the Home dashboard's `metric-cards.tsx` (duplicated pattern, not reinvented).
3. **Revenue trend** — `AreaChart` inside `ChartContainer`/`ChartTooltip`, directly duplicating `src/app/(main)/dashboard/default/_components/performance-overview.tsx`'s real, already-shipped structure (same gradient-fill area, same tooltip formatter, same 6-month trailing label helper) — swapped onto this page's own 6-month payments query rather than re-fetching `useManagerOverview`'s cache, since this page's revenue-trend window is deliberately "all payments this calendar range" not "approved only," matching v1's own `computeManagementReportData` exactly (v1's revenue trend is unconditional on payment status; only commission/expense cash-basis figures filter to approved).
4. **Pipeline composition + Payments by method** — two donuts side by side on wide viewports, stacked on narrow ones, both directly duplicating `src/app/(main)/dashboard/finance/_components/balance-distribution-card.tsx`'s real structure (centered total label inside the ring, colored-dot legend list with percentages) — the one already-shipped real donut resource in this codebase, reused twice with real data instead of its current static demo array.
5. **Top agents this month** — a plain ranked list (rank badge, name, new-lead count, revenue), same visual language as My Portfolio's own rank hero card for consistency within this Insights-group "family" of screens.
6. **Net position card** — big signed figure (green/red by sign), the real v1 caveat sentence carried over verbatim.
7. **Footer link** — "Need a downloadable PDF or Excel export instead?" → `/dashboard/finance?tab=reports`, the real existing destination.

Entrance animation: same staggered `card-enter` keyframe already established in Smart Insights' `.module.css` (reused, not forked) — each section fades/slides in with an incremental per-section delay on load, consistent with this queue's established "very animated futuristic way" direction.

## 6. Porting approach

1. New hook `src/webnext/features/analytics/hooks/useAnalyticsOverview.ts` — its own dedicated query (not reusing `useManagerOverview`'s cache key, since this page's revenue trend and top-agents cut are real, different aggregations from the Home dashboard's), covering: KPIs, 6-month trend, pipeline composition (ported from `computePipelineComposition`'s real logic), payments-by-method, top-5-agents-by-month-revenue, net position (ported from `computeCashBasisNetPosition`'s real logic).
2. New hook `useManagerDailyBriefing` (same shape as `useLeaderboardGapCoach`) calling the `ai-insights` function with `kind: 'manager_daily_briefing'`.
3. New screen `AnalyticsScreen.tsx` + its own `.module.css` for the stagger/entrance treatment.
4. New route `src/app/(main)/dashboard/analytics/page.tsx`.
5. Wire `sidebar-items.ts`'s `analytics` entry (currently `NOT_BUILT_YET`) only once verified live.

## 7. QA

Real test: load as Management, confirm every KPI/chart number against a direct SQL cross-check (same discipline as every prior app in this queue — Data Check's "267 scanned, 148 flagged" cross-check, My Portfolio's "398 points" cross-check). Confirm the AI briefing sentence actually renders and cites real numbers, not a generic placeholder. Load as a real staff test account (Adams), confirm the redirect card appears and its link lands on `/dashboard/smart-insights`. Confirm both donuts render correctly with zero data (empty state, not a crash) by checking the logic path, not by deleting real production rows.
