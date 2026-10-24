# My Portfolio — build plan (palmstead-v2-shell)

Fourth of 7 apps in the "Insights" build order (Smart Insights, Data Check, Document Vault done — same precedent: port already-correct logic, rebuild the UI natively, never on top of `web-next/`'s own UI).

## 0. This is a real v1 port, and the backend is already fully live

Real v1 feature, `viewPortfolioApp()` at `index.html:16812-16874` plus `paintPerformanceSection()` (16880-16910) and the achievement evaluation engine (`evaluateMyAchievements()`/`paintAchievementGrid()`, around 19687-19713 and 20055-20165 in two code regions). Sidebar label: `'Portfolio':'Your achievements, skins, and unlocked rewards'`. **Agent-only** — v1 gates managers out explicitly: *"Portfolio is for individual staff tracking — as Management you already see everyone on the Leaderboard."* This shell's own sidebar already positions it the same way (no Management variant to build for this app; Management's equivalent view is the separate Leaderboard app, #7 in this queue).

**Correcting the 2026-10-23 research memo's open question**: `web-next/src/features/portfolio/` already has a complete, correct, *server-authoritative* logic layer — `usePortfolio.ts` + `portfolioLogic.ts` — covering both real v1 halves (performance/rank/gap and the achievement trophy cabinet), plus one capability v1 itself never had: an AI coaching sentence (`useLeaderboardGapCoach`, kind `leaderboard_gap_coach`). It was never wired to a screen (`PortfolioScreen.tsx` exists but is a single-scrolling-page, hand-styled CSS-module screen — reference logic only, per standing rule, never built on top of). Confirmed this session:
- `achievement_definitions` / `staff_achievements` tables are real and live on `sbydzrlzqxcdbudjaube`, seeded with the **same 8 real definitions** already in production use: To-Do Titan (30 todos), Top Collector (GHS 100k collected), Deal Closer (5 deals/yr), Referral Champion (3 conversions), Task Master (20 tasks), Perfect Attendance (22 days), Punctuality Star (20 on-time days), Site Visit Pro (10 visits). 2 real `staff_achievements` rows already earned — real data, never touched during this build.
- `palmstead-v2-shell`'s own `src/webnext/data/source.ts` **already implements** `achievements.listDefs()/listEarned()/award()` (lines 907-911, 3129-3147) and `manager.leaderboardScores()/referralConversions()` (1190-1211, 3728-3753) — the exact same server-authoritative `recompute_leaderboard_scores()` RPC both Leaderboard and Portfolio must agree on (Leaderboard V3 Phase 1-3 already shipped this). **Zero new data-source work needed** — this app is UI-only plus one small AI-wiring gap (below).
- The `leaderboard_gap_coach` AI kind **is already deployed** on the shared `ai-insights` Edge Function (confirmed by reading its live source this session, version 33) — only the client-side hook (`useLeaderboardGapCoach`, portable almost verbatim from web-next) is missing in this shell.

## 1. Database

None. Every table this app reads (`achievement_definitions`, `staff_achievements`, `leaderboard_scores` via the RPC) already exists, is already seeded with real content, and is already read by the existing data-source methods above.

**One real gap found and fixed**: `pg_publication_tables` confirms `staff_achievements` and `achievement_definitions` are **not** in the `supabase_realtime` publication (checked this session). Without this, a second device/tab earning an achievement wouldn't show the update live — the whole point of the celebratory unlock moment needs to work the moment it happens, not after a manual refresh. Added both tables to the publication (migration, §1a below) so the unlock can fire from a live Postgres change event exactly like every other realtime-wired table in this shell, consistent with the standing [[realtime-publication-membership]] lesson (table alone isn't enough — must explicitly add to the publication, `pg_publication_tables` is the only way to actually confirm it, synthetic testing can't catch this).

### 1a. Migration

```sql
alter publication supabase_realtime add table staff_achievements;
alter publication supabase_realtime add table achievement_definitions;
```

No RLS changes — existing policies already correctly scope `staff_achievements` SELECT to the row's own `staff_key` or a manager (confirmed via `pg_policies`, matches `apiAwardAchievement`'s real v1 comment: "staff_achievements_ins requires `staff_key=my_key()` (or manager)").

## 2. Security

No new policies. `achievement_definitions` is readable by any authenticated staff member (a catalog, not sensitive); `staff_achievements` SELECT is owner-or-manager (confirmed above); `award()`'s INSERT is already constrained server-side to `staff_key = my_key()` — a client can only ever award *itself* an achievement, never spoof another staff member's row, and the `ignoreDuplicates` upsert constraint (`staff_key, achievement_id`) makes re-running evaluation on every visit safe (a silent no-op for an already-earned badge, never a duplicate row or a double-celebration bug).

## 3. AI touchpoints

One capability, already deployed server-side, needs client wiring: `leaderboard_gap_coach` — given the agent's real rank, points, gap to the agent above, and the already-computed plain-arithmetic suggestions, drafts one short second-person coaching sentence. Deterministic math (rank, gap, suggestion list) is computed first and shown immediately; the AI sentence is a progressive enhancement appended below it (same graceful-null pattern as every other AI touchpoint in this shell — demo mode or an unset key simply shows no coaching line, never a broken state).

No AI touchpoint for the achievement grid itself — it's a deterministic earned/locked/progress grid, nothing to narrate.

## 4. UI — page architecture

Two real pages, not one (unlike Data Check's genuinely-one-result-set case) — v1's own layout already treats Performance and Achievements as two distinct sections with their own heading, and the Achievement grid has real depth (a cabinet toggle, 8 tiles with progress bars, an earned-date/points footer) that deserves its own page rather than being a scrolled-past half of an overview, mirroring this queue's own Smart Insights precedent (overview + drill-down):

```
/dashboard/my-portfolio              Rank/gap hero card (large mono rank number, points,
                                      "of N on the team"), gap-to-next card with the real
                                      plain-English suggestion list + the AI coaching
                                      sentence appended, then a condensed achievement
                                      summary strip ("5 of 8 earned · 850 points") that
                                      links through to the full cabinet.

/dashboard/my-portfolio/achievements Full trophy-cabinet grid -- "my cabinet" toggle
                                      (earned-only vs. all 8), each tile earned (solid,
                                      full-opacity icon, gold-tinted elevated border,
                                      "Earned {date} · +{points} pts" footer) or locked
                                      (icon desaturated via grayscale+opacity scaled to
                                      real progress pct -- v1's own formula, kept
                                      verbatim: opacity max(.25, pct/100), grayscale
                                      (100-pct)% -- slim rounded progress bar beneath,
                                      "{value}/{threshold}" label). Realtime-subscribed
                                      to staff_achievements for this agent's own key --
                                      earning a new one live triggers the unlock
                                      celebration without a refresh.
```

**Unlock celebration** (triggered by the realtime insert, or by the evaluation engine's own award() on page load): a modal — solid gold circular badge with the achievement's real emoji icon, a CSS-only radial confetti/burst flourish behind it (no new animation dependency, per the `animate` skill's cheapest-tool-that-works rule), scale-in `0.95→1` + fade (`ease-out`, ~250ms, matching this shell's own established pop-in treatment from Smart Insights' danger-glow work), "{label}" + "+{points} points", a single "Nice!" dismiss button. Reduced-motion gets the same content with the burst/scale dropped per the standing reduced-motion rule.

## 5. Porting approach

1. Port `portfolioLogic.ts` verbatim (`computeGapSuggestions`, `mergeReferralConversions`) — pure functions, zero changes needed.
2. Port `usePortfolio.ts` + `useLeaderboardGapCoach` verbatim — already calls this shell's own `achievements`/`manager` data-source methods, which already exist with matching signatures.
3. Add a realtime subscription (`staff_achievements`, filtered to `staff_key = eq.<my key>`) via this shell's existing realtime-hook pattern (same helper the 2026-10-07 round-2 fix added retry-on-failed-join to, benefiting this channel too) — invalidates `['staffAchievements', myKey]` on INSERT, which re-renders the grid and triggers the unlock modal for the newly-earned def.
4. Build two fresh native shadcn screens (`Card`, `Badge`, `Progress` or a custom slim bar, no CSS modules) — rank hero card modeled on the Trophy/shadcn.io leaderboard-card anatomy (mono rank number + stacked meta), achievement grid modeled on shadcn.io's `awards-grid`/`awards-grid-animate` skeleton (staggered entrance, hover-lift) adapted to this project's earned/locked/progress states.
5. Wire `sidebar-items.ts` (`my-portfolio` entry, currently `NOT_BUILT_YET`) only once verified live.

## 6. QA

Real test: load as a real staff test account, confirm rank/points/gap match a hand cross-check against `leaderboard_scores`; confirm the achievement grid's progress percentages match real `leaderboard_scores`/`staff_referral_conversions` values for at least 2 of the 8 criteria types. Force a real unlock: pick a staff member close to a real threshold (or temporarily lower a `criteria_config.threshold` on a copy/test definition, never a real one, and revert after) and confirm the modal fires live via the new realtime subscription without a manual refresh, then confirm it does NOT re-fire on a second visit (the `ignoreDuplicates` no-op). Confirm a manager visiting `/dashboard/my-portfolio` sees the v1-parity redirect message, not a broken/empty staff screen. Clean up any test threshold change or test data after verification.
