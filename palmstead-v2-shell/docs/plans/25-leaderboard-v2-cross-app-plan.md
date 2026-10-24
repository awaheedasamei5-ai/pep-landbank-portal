# Leaderboard v2 — cross-app scoring + professional rebuild

User feedback (2026-10-24, verbatim): "the leaderboard needs to be connected to all the app, search on github for a leaderboard app, then clone it and give it a very professional setting... take your time analyzing the codebase for all the apps in the system." This supersedes the v1 slice (`docs/plans/24-leaderboard-plan.md`, still a correct port of what existed at the time) — not a redo of broken work, a deliberate expansion the user wants deeper.

## 0. Real GitHub research (done this session, not fabricated)

Searched GitHub/web directly for a cloneable, real, starred leaderboard app. **Finding, stated honestly**: no real, production, open-source *full-app* sales/gamification leaderboard exists to clone wholesale — this space is dominated by closed-source SaaS (Trophy.so, Xoxoday). What's real and usable:
- **`nayanrdeveloper/shadcn-extras`** (real public GitHub repo, MIT, Motion+Tailwind+shadcn) — ships a real `LeaderboardCard` podium component in the exact stack this app already uses. **Primary structural donor.**
- **Intent UI's `Leaderboard`** (21st.dev, MIT) — a dense ranked-table row pattern (rank/avatar/name/score columns), secondary reference for the full list below the podium.
- **Trophy.so's published component set** (not open-source, reference-only for information architecture) — the real shape a "professional" version of this feature takes in the wild: **podium (top 3) + tiered levels/leagues + a points-over-time chart + achievement grid, as separate composable cards**, not one dense table. This is the target page architecture.

## 1. What "connected to all the apps" means, grounded in the real schema

Current scoring formula (`recompute_leaderboard_scores()`) draws from exactly 4 tables: `payments`, `leads`, `site_visits`/`schedule_items` (which — confirmed this session — already mirrors Operations Tracker's `op_issues`/`op_todos`, so Operations Tracker is *already* connected, not a gap), `attendance_log`. Real, clean, agent-attributable signals that exist and are **not yet connected**:

| New metric | Real source | Column |
|---|---|---|
| Quotations sent | `quotation_requests` | `requested_by` |
| Contracts generated | `contract_generations` | `generated_by` |
| Referrals converted | `staff_referral_conversions()` RPC (already live, already powers the Referral Champion achievement) | — |

**Deliberately NOT added**: `complaints` — a complaint is a quality/risk signal, not a productivity one; rewarding "complaints resolved" with leaderboard points would perversely incentivize generating resolvable complaints. This is a real app, not a metric to game — Complaints stays out of the points formula, same discipline v1 itself applied (it never fed complaints into `agentPoints()` either).

## 2. Database changes

Migration `leaderboard_scores_cross_app_metrics`:
- `alter table leaderboard_scores add column quotations_sent int not null default 0, add column contracts_generated int not null default 0, add column referrals_converted int not null default 0;`
- `recompute_leaderboard_scores()` extended with two new CTEs (`quotes as (select requested_by as key, count(*) from quotation_requests where created_at::date between p_from and p_to group by requested_by)`, `contracts_gen as (select generated_by as key, count(*) from contract_generations where generated_at::date between p_from and p_to group by generated_by)`) plus a join to the existing `staff_referral_conversions(p_from, p_to)` RPC, all left-joined into `raw`/`scored` the same way every existing metric already is, three new weighted terms added to the `points` formula, three new weight keys added to `app_config.leaderboard_weights`'s JSONB shape (`quotationsSent`, `contractsGenerated`, `referralsConverted` — defaulted to a modest real value, not zero, so the new metrics actually count immediately rather than needing a manual config step first).
- `LeaderboardWeights`/`LeaderboardRow` TS types gain the three new fields; `agentPoints()` in `leaderboardLogic.ts` updated to mirror the SQL exactly (same "keep both in sync" discipline the function's own comment already states).

## 3. UI — real rebuild per the researched information architecture

Replacing the single ranked-list screen with the Trophy.so-shaped composition, built as real shadcn/Tailwind components (not npm-installing shadcn-extras wholesale — its one real component is small enough to hand-adapt cleanly into this app's own token system, consistent with every other "duplicate a real resource" port in this codebase):

```
/dashboard/leaderboard
  ├─ Podium card (top 3, shadcn-extras-style: center-elevated #1, flanking #2/#3,
  │   real avatar, animated count-up score -- a real, cheap CSS/JS count-up,
  │   not a library)
  ├─ Tier/League strip (Bronze/Silver/Gold/Diamond bands computed from each
  │   agent's real point total against the real team's own point distribution
  │   -- quartile-based, not hardcoded thresholds, so it stays meaningful
  │   regardless of team size or score scale)
  ├─ Points-over-time chart (reuses this app's own real `leaderboard_score_history`
  │   audit table -- already live, already real -- as a real trend line per
  │   agent, not synthetic data)
  ├─ Full ranked list (Intent UI's dense-row pattern) below the fold, every
  │   metric pill now including the 3 new ones
  └─ Export CSV / Manage scoring (unchanged, already real)
/dashboard/leaderboard/admin
  └─ Weight editor gains 3 new fields (new "Cross-app activity" group:
     quotations sent / contracts generated / referrals converted), same
     live what-if preview, same audit log, unchanged otherwise.
```

Staff/manager role split unchanged (resolved correctly in v1's plan, not revisited).

## 4. Porting approach

1. Apply the migration above.
2. Update `leaderboardLogic.ts`'s `agentPoints()` + `LeaderboardWeights`/`LeaderboardRow` types.
3. Rebuild `LeaderboardScreen.tsx` with the podium/tier/chart/list composition (new sub-components: `LeaderboardPodium.tsx`, `TierStrip.tsx`, `PointsTrendChart.tsx`).
4. Extend `LeaderboardAdminScreen.tsx`'s weight editor with the new group.
5. Verify live against real data, commit, push, deploy.

## 5. QA

Real test: confirm the new quotations/contracts/referrals counts match a direct SQL cross-check for a real test account. Confirm the tier strip's banding reacts sensibly to the real current team spread. Confirm the points-trend chart renders real `leaderboard_score_history` rows (there are already real ones from this session's own testing). Confirm the admin workspace's what-if preview includes the 3 new weights and still reverts cleanly without persisting.
