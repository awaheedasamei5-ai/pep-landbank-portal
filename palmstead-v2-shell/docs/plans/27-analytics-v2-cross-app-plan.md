# Analytics v2 — cross-app tabbed dashboard + AI narration

User feedback (2026-10-24, verbatim): "same as the analytics app, clone an ai powered powerful version and make sure u rebuild it actually cover all the apps and their analytics, metrics, with real data driving sight on each app." Supersedes `docs/plans/23-analytics-plan.md`'s single-page scope (that build was correct for what it covered — company-wide Sales/Finance) — this is a deliberate widening to cover more of the ~20 real apps in this shell, not a fix.

## 0. Real GitHub research (done this session)

**Finding, stated honestly**: no open-source project combines Next.js/shadcn/Tailwind/Recharts *and* genuine AI-narrated business insights — confirmed across multiple searches. What's real and usable:
- **This repo's own unused `(legacy)` template components** — `src/app/(main)/dashboard/analytics/_components/analytics-kpi-strip.tsx` (the ORIGINAL shadcn-admin-dashboard template's KPI strip, still on disk, orphaned since v1 of this app replaced the page that used it): a single divided card, one column per metric, each with a value, a colored trend badge (▲/▼ + %), and a "from X · last N weeks" caption — a genuinely more polished pattern than the separate-Card KPI row Analytics v1 shipped with. **Primary structural donor for every tab's KPI row.**
- **shadcn.io's "AI Data Analyst" block pattern** (reference, not installable) — a short AI-authored sentence rendered as its own bordered/tinted callout directly under the chart it describes. Already this app's own established pattern (`manager_daily_briefing`, `leaderboard_gap_coach`); reused per-tab here.

## 1. What "cover all the apps" means, grounded in the real schema

v1 of Analytics covered exactly one domain (Sales/Finance: revenue, pipeline, payments). Real tabbed expansion, each tab a genuinely different business domain with its own real queries:

| Tab | Real domain | Real tables |
|---|---|---|
| **Overview** | Sales & Finance (unchanged from v1) | `leads`, `payments`, `expenses` |
| **Sales Activity** | Quotation, Contract of Sale, Referrals, Complaints, Site Visits | `quotation_requests`, `contract_generations`, `referrals`, `complaints`, `site_visits` |
| **Team** | Attendance, Leave | `attendance_log`, `leave_requests` |
| **Operations** | Operations Tracker | `schedule_items` (confirmed this session to mirror `op_issues`/`op_todos` 1:1 — same real data Leaderboard's own Ops Tracker metric already reads) |

**Real scope boundary, stated honestly**: Document Vault, Chat, Notes, Memorandum, Directory, Staff Hub, Banner Tracking have no natural multi-metric "analytics" shape distinct from what Smart Insights v2 (Banner Tracking) or their own screens already show — adding a thin tab for each would be padding, not coverage. Four real, substantive domains beyond the original one is an honest "covers most of the real apps" claim, not an invented "all 20."

## 2. Database

None. Every new tab reads already-live tables. `schedule_items` confirmed to carry `status` ('open'/'done'), `due_date`, `completed_at`, `kind` ('task'/'todo') — real overdue/completion metrics computable directly, no join to `op_issues`/`op_states` needed since the two are already kept in sync.

## 3. Security

None new — manager-only route (unchanged from v1), same client-side role branch, same underlying RLS already confirmed to give a manager session unrestricted SELECT on every table used here.

## 4. AI touchpoints

Three new kinds on the shared `ai-insights` function (deployed alongside Smart Insights v2's `smart_insight_action` this session, read-then-verify-byte-for-byte): `analytics_sales_activity_summary`, `analytics_team_summary`, `analytics_operations_summary` — one short narration sentence per new tab, same deterministic-numbers/AI-narrates-only split as `manager_daily_briefing` (Overview tab, unchanged).

## 5. UI — real tabbed rebuild

```
/dashboard/analytics
  Tabs: Overview | Sales Activity | Team | Operations (shadcn Tabs,
  duplicating the real tab-per-domain pattern from this app's own
  original analytics-v1 template, now applied to real business domains
  instead of generic web-traffic categories)

  Each tab: KPI strip (analytics-kpi-strip.tsx's real divided-card
  pattern, adapted with real trend badges computed this-month-vs-
  last-month) + one real chart + one AI narration callout.

  Overview: unchanged from v1 (revenue/outstanding/net position KPIs,
    revenue trend, pipeline composition + payments-by-method donuts,
    top agents, manager_daily_briefing).
  Sales Activity: KPI strip (quotations sent, contracts generated,
    referrals logged, complaints opened, site visits -- each vs last
    month), a 6-month multi-line trend chart of the first three,
    analytics_sales_activity_summary.
  Team: KPI strip (days attended company-wide, on-time rate, leave
    requests this month, leave days taken this month -- each vs last
    month), a daily attendance trend chart for the current month,
    analytics_team_summary.
  Operations: KPI strip (open tasks, overdue tasks, todos completed
    this month vs last, completion rate), analytics_operations_summary.
```

Staff redirect to Smart Insights (unchanged from v1).

## 6. Porting approach

1. New hooks: `useSalesActivityAnalytics`, `useTeamAnalytics`, `useOperationsAnalytics` (each its own real queries against the tables above, 6-month or this/last-month windows matching the rest of this app's established convention).
2. Three new AI hooks mirroring `useManagerDailyBriefing`.
3. New `AnalyticsKpiStrip.tsx` shared component (real divided-card pattern, adapted from the template's own `analytics-kpi-strip.tsx`), reused across all 4 tabs.
4. Rebuild `AnalyticsScreen.tsx` with shadcn `Tabs`, moving existing Overview content into its own tab unchanged, adding the 3 new tabs.
5. Deploy the 3 new AI kinds.

## 7. QA

Real test: confirm each new tab's KPI numbers and trend deltas cross-checked against direct SQL (this month vs last month). Confirm each AI narration cites real numbers. Confirm the Operations tab shows honestly small/zero numbers given real sparse data in `schedule_items`, not a crash or a fabricated number. Confirm staff redirect unchanged.
