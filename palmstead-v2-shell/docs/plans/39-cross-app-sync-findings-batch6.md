# Batch 6 findings — Smart Insights, Data Check, Analytics, Leaderboard, My Portfolio

Part of the full test sweep + cross-app integration analysis (see `docs/plans/30-master-system-audit-and-unification-plan.md` for the overall effort this feeds into). This batch is the system's own "intelligence layer" — the clearest evidence of whether "one connected system" is true today.

## Smart Insights — genuinely cross-app, broader than it first appears

Real `InsightKind`/`CrossAppInsightKind` list (`src/webnext/features/smart-insights/lib/smartInsightsLogic.ts`), confirmed live:

- **Pipeline-native**: cold leads, ready-for-allocation (≥30% paid), near-trigger (20–30% paid), stalled-high-priority.
- **Cross-app** (each explicitly tagged with its source app): Complaints (7+ days open), Referrals (14+ days pending), Allocations (5+ days pending), Contract Requests (5+ days awaiting generation), Leave (3+ days awaiting decision), Banner Tracking (zero leads after 14 days).

Live as Management: 6 of 7 categories had real cards (25 cold leads, 5 ready-for-allocation, 2 stalled-high-priority, 2 aging complaints, 1 aging referral, 4 aging allocations, 61 zero-lead banners). **Contract Requests aging and Leave pending showed nothing — verified via SQL this is a real empty state (0 qualifying rows for both), not a bug.**

**Real gap — missing sources, not a bug but a genuine scope limit**: no Site Visits insight (e.g. "N site visits logged with no outcome" — Data Check already has this exact rule, Smart Insights doesn't), no Attendance/Leave-pattern insight, no Operations Tracker insight, no per-client Accounting/payment-health insight beyond the one company-wide "collections down" card. Concrete fix: add `CrossAppInsightKind` entries for these using the same pattern already proven for the existing 6 — this is additive, low-risk, and directly serves the user's "surface things staff would otherwise have to notice themselves" goal.

## Data Check — real but narrow; almost entirely leads-scoped

Real rule list (`src/webnext/features/data-check/lib/dataIntegrityCheck.ts`): missing unit price, price mismatch, total out of sync, overpaid, ledger mismatch, missing quantity, missing contact, missing next action, stale lead (30+ days) — all `leads`-table checks — plus exactly **one** cross-app rule: site visits with no logged outcome.

**Real gap**: despite Smart Insights already proving (in this same codebase) that complaints/referrals/allocations/leave/banners are all queryable for exactly this kind of staleness check, Data Check has zero rules for any of them. Concrete fix: port Smart Insights' aging-threshold pattern into Data Check as real "danger/warn" issues — same underlying queries, different presentation (Data Check is the "fix this" worklist, Smart Insights is the "here's what's happening" digest; they should likely share a rule-definition layer rather than duplicate logic twice).

## Analytics — 4 real tabs (Overview, Operations, Sales Activity, Team)

Confirmed via `src/webnext/features/analytics/hooks/` (`useAnalyticsOverview`, `useOperationsAnalytics`, `useSalesActivityAnalytics`, `useTeamAnalytics`, plus `useManagerDailyBriefing`/`useAnalyticsTabNarration` for the AI narration layer) — a real 4-dimension breakdown already spanning Sales and Operations data. Not exhaustively click-tested live this batch due to time; the code structure indicates broad real coverage, not a silo. Flagged for a future batch to live-verify numbers tab-by-tab if a dedicated pass is wanted.

## Leaderboard — reconciles exactly against real data (verified)

The single most valuable check in this batch. Picked Elias (highest scorer, 553 points) and manually reconciled two of `leaderboard_scores`' stored columns against the real source tables:

- `total_collected` = 201,499.99 in `leaderboard_scores` vs. `select sum(amount) from payments where agent_key='elias' and status='approved' and payment_date between '2026-01-01' and '2026-12-31'` = **201,499.99 — exact match**.
- `site_visits` = 12 in `leaderboard_scores` vs. real `site_visits` row count for Elias in 2026 = **12 — exact match**.

**Verdict: Leaderboard is trustworthy, not stale or disconnected.** This matters because scoring is compensation-adjacent — staff need to trust these numbers are real.

## My Portfolio — intentionally shares Leaderboard's own RPC, by design

`usePortfolio.ts` explicitly calls the *same* `leaderboardScores()` RPC Leaderboard itself uses, with an explicit code comment citing this as an invariant ("an agent's own rank here can never disagree with what Management sees on the Leaderboard"). Also merges in real referral-conversion data and achievement records. This is the cross-app sync pattern working correctly, not a gap — My Portfolio is already a real cross-app rollup for each staff member (their money collected + deals + site visits + referrals, in one place), exactly matching what the user asked this batch to check for.

## Real bug found and fixed

`data_check_dismissals` was in the `supabase_realtime` publication but never subscribed in `useDashboardRealtime.ts` — the third instance of this exact bug class this session (after `attendance_corrections` in Batch 3 and the chat tables in Batch 5). A Data Check finding dismissed on one device wouldn't disappear live on another open session until a manual refresh. Added the missing `.on('postgres_changes', ...)` listener invalidating the real `['dataCheckDismissals']` query key. `npx tsc -b` clean.

## Security / data quality

RLS for `leaderboard_scores`, `leaderboard_score_history`, `data_check_dismissals` all sound — no gaps. No other data-quality issues found this batch beyond the Leaderboard reconciliation (which passed).

## Priority summary for the master findings doc

1. **High-value, low-risk, additive**: give Smart Insights and Data Check the missing cross-app rules each already proves is buildable in the other — Site Visits/Attendance/Operations coverage for Smart Insights, Complaints/Referrals/Allocations/Leave/Banners coverage for Data Check. Consider unifying them on one shared rule-definition layer instead of duplicating logic.
2. **Confirmed strength to preserve**: Leaderboard/My Portfolio's shared-RPC invariant. Don't let future work introduce a second, divergent scoring calculation anywhere.
