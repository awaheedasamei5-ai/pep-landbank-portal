# Leaderboard — build plan (palmstead-v2-shell)

Seventh and final app in the "Insights" build order. Per [[project-leaderboard-v3-audit-and-plan]] this has the deepest prior work of all 7: server-authoritative scoring (Phase 1), an admin workspace with live what-if preview + score-change audit log (Phase 2), and 2 of 4 planned AI capabilities (Phase 3), all already built and verified live in `web-next/` — never wired to a screen in this shell. Phase 4 (reports) was never started anywhere.

## 0. Role scoping, resolved from real v1 source (same method as Analytics)

`index.html:9154` — `...(isMgr?[{key:'Leaderboard',...}]:[])` — and `viewManagementHub()` (line 9243) both confirm Leaderboard's full ranked-everyone view is manager-only in v1, same as Analytics/Commission's manager branch. Staff's real window into the same scoring system is their own rank, already live at **My Portfolio** (`/dashboard/my-portfolio`) — built earlier in this exact queue, reading the identical `leaderboardScores()` RPC. So: Manager gets the real ranked list + admin workspace here; staff get a redirect to My Portfolio, consistent with the inverse-redirect pattern already established by Analytics (→ Smart Insights) and Commission's manager branch (→ Accounting).

## 1. What's being ported

**`useLeaderboard.ts`** (web-next) — trivial, directly reusable: calls `ds.manager.leaderboardScores(from, to)`, already confirmed identical in this shell's `source.ts`.

**`LeaderboardScreen.tsx`** (web-next) — leader/runner-up catch-up banner + full ranked list with per-agent pill row (collected, deals, visits, tasks, to-dos, attendance). Native shadcn rebuild, not a UI port.

**`useLeaderboardAdmin.ts`** (web-next) — `useLeaderboardRawRows` (raw unscored rows for instant client-side what-if preview via `agentPoints()`, already ported to `leaderboardLogic.ts` in this shell), `useLeaderboardScoreHistory` (real audit trail), `useLeaderboardSpikeAlert` (AI, kind `leaderboard_spike_alert`, confirmed live on the shared `ai-insights` function per the same `get_edge_function` read used for Analytics' `manager_daily_briefing`).

**`LeaderboardAdminScreen.tsx`** (web-next) — weight editor (3 groups: Sales performance / Activity & tasks / Attendance) with live what-if reorder preview, plus a real score-change audit log with AI-flagged spike rows. Native shadcn rebuild.

**`agentPoints()`/`isScoreSpike()`** (`leaderboardLogic.ts`) — already ported to this shell verbatim (confirmed: both functions present). No changes needed.

## 2. Database

None. `leaderboard_scores`/`leaderboard_score_history` tables, `recompute_leaderboard_scores()`/`staff_referral_conversions()` SECURITY DEFINER functions, and `app_config.leaderboard_weights` are all already live (Phase 1/2, 2026-09-10) and already confirmed callable by any `authenticated` session this session (same `has_function_privilege` check already run for My Portfolio).

## 3. Security

None new. Weight edits go through the existing `useUpdateConfig()` mutation (manager-gated by the real `app_config` RLS, unchanged — the same mutation Settings already uses for every other config field). Route-level manager/staff branch is client-side role check, same as every other app in this queue — never the actual access boundary, since the real boundary is DB RLS underneath, already correct.

## 4. AI touchpoints

Two, both already live server-side, neither wired to a screen in this shell until now:
- **`leaderboard_gap_coach`** — already wired, via My Portfolio (built earlier this session). Not re-wired here.
- **`leaderboard_spike_alert`** — management-facing, for the admin workspace's score-history panel. Deterministic `isScoreSpike()` (delta ≥150 points or ≥50% relative jump) decides which rows deserve a flag; AI only drafts the neutral review-request sentence for rows that already passed, so a quiet week spends zero Groq calls.

No new AI work — the other 2 of 4 originally-planned capabilities ("explain score change" with per-metric deltas, "fair performance narrative") remain genuinely out of scope: the audit memo itself notes the first would need `leaderboard_score_history` to snapshot metric-level deltas, not just points, a real schema change beyond "wire up what already exists" — tracked honestly as still open, not invented here.

## 5. UI — page architecture

Two real pages, mirroring My Portfolio's own overview + drill-down split:

```
/dashboard/leaderboard          Manager: ranked list + leader/catch-up
                                  banner + CSV export. Staff: v1-parity
                                  redirect to My Portfolio.
/dashboard/leaderboard/admin    Manager-only (same redirect for staff).
                                  Weight editor with live what-if
                                  preview + score-change audit log with
                                  AI spike flags.
```

**Real, explicitly acknowledged scope boundary, carried forward honestly rather than silently dropped**: v1's own `mgrLeaderboard()` (index.html:20198-20283) renders a much richer 12-column table — `closedValueYear`, `totalPipeline`, `winRate`, pipeline `health` tag, `avgMonthly`, `workloadVolume` — all explicitly commented there as "display-only enrichment... stays client-computed", i.e. never part of the points formula itself. web-next's own port already deferred this once ("Still out of scope here... a real follow-up, not a gap in the points themselves"). This plan defers it a second time, for the same reason, not out of laziness: building it requires several new queries (workload from tasks/todos, pipeline health from the full lead list) that are pure display polish on top of an already-complete, already-correct scoring system — the kind of scope that would turn the final app of a 7-app queue into an open-ended enrichment project rather than a finished one. Tracked here for whichever future session picks it up.

**Real addition over web-next's own port**: a CSV export button (v1 has one, "⬇ Export CSV" at index.html:20281; web-next's screen comment explicitly left it out). This is a small, real, already-fully-supported-by-existing-data feature (the same columns already rendered in the table), so including it here closes a twice-deferred real gap rather than deferring it a third time for no reason.

## 6. Porting approach

1. `src/webnext/features/leaderboard/hooks/useLeaderboard.ts` — port verbatim.
2. `src/webnext/features/leaderboard/hooks/useLeaderboardAdmin.ts` — port verbatim (3 hooks).
3. `src/webnext/features/leaderboard/screens/LeaderboardScreen.tsx` + `.module.css` — native shadcn rebuild: leader hero card (reusing the amber/trophy visual language already established in My Portfolio's rank card), ranked `Table` with per-agent pill badges, CSV export via a small client-side blob-download helper (same pattern already used by every Excel/CSV export elsewhere in this shell).
4. `src/webnext/features/leaderboard/screens/LeaderboardAdminScreen.tsx` + `.module.css` — native shadcn rebuild: weight editor in 3 `Card`s with live what-if preview list (▲/▼ rank-change badges), score-history panel with `HistoryRow` AI-spike sub-component (same hooks-not-called-conditionally pattern web-next already established).
5. Two routes: `src/app/(main)/dashboard/leaderboard/page.tsx`, `src/app/(main)/dashboard/leaderboard/admin/page.tsx`.
6. Wire `sidebar-items.ts`'s `leaderboard` entry (currently `NOT_BUILT_YET`) only once verified live.
7. Update My Portfolio's manager-redirect link target (`src/webnext/features/portfolio/screens/PortfolioScreen.tsx`, currently points at the placeholder `/dashboard/coming-soon`) to the real `/dashboard/leaderboard` now that it exists — a real, small follow-up fix this app's own completion unlocks.

## 7. QA

Real test: load as Management, confirm the ranked list and leader/catch-up banner cross-checked against a direct SQL call to `recompute_leaderboard_scores()`. Confirm CSV export produces a real file with the right rows. Load the admin workspace, adjust a weight, confirm the what-if preview reorders correctly against hand-verified arithmetic, confirm it does NOT persist until Save, save, confirm the Leaderboard screen picks up the identical new points via cache invalidation, then revert the weight back to its original value and confirm both screens return to their original state (same revert discipline as the original Phase 2 QA). Confirm the score-history panel shows real rows and any flagged spike renders real AI text. Load as a real staff test account (Adams), confirm both routes redirect to My Portfolio. Confirm My Portfolio's own manager-redirect link now correctly points at `/dashboard/leaderboard` instead of the old placeholder.
