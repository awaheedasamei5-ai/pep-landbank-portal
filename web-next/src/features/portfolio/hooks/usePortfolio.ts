import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { agentPoints } from '../../manager/lib/leaderboardLogic';
import { computeGapSuggestions, mergeReferralConversions } from '../lib/portfolioLogic';

// Reads the exact same leaderboard_rows RPC + agentPoints() formula
// Leaderboard itself uses (index.html's own comment on paintPerformance
// Section makes this an explicit invariant: "an agent's own rank here
// can never disagree with what Management sees on the Leaderboard") --
// so this intentionally doesn't reuse useLeaderboard() as a black box,
// it re-derives from the same two primitives to stay obviously in sync.
export function usePortfolio() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  const myKey = profile?.key ?? '';
  const year = new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const { data: config } = useConfig();

  const rowsQuery = useQuery({
    queryKey: ['portfolioRows', year, demoMode],
    enabled: !!profile,
    queryFn: async () => {
      const ds = getDataSource(demoMode);
      const [rawRows, conversions] = await Promise.all([ds.manager.leaderboardRows(from, to), ds.manager.referralConversions(from, to)]);
      return mergeReferralConversions(rawRows, conversions);
    },
  });

  const defsQuery = useQuery({
    queryKey: ['achievementDefs', demoMode],
    queryFn: () => getDataSource(demoMode).achievements.listDefs(),
  });

  const earnedQuery = useQuery({
    queryKey: ['staffAchievements', myKey, demoMode],
    enabled: !!myKey,
    queryFn: () => getDataSource(demoMode).achievements.listEarned([myKey]),
  });

  const scored = useMemo(() => {
    if (!rowsQuery.data || !config) return [];
    return rowsQuery.data.map((r) => ({ ...r, points: agentPoints(r, config.leaderboardWeights) })).sort((a, b) => b.points - a.points);
  }, [rowsQuery.data, config]);

  const myIndex = scored.findIndex((r) => r.staffKey === myKey);
  const me = myIndex >= 0 ? scored[myIndex] : null;
  const above = myIndex > 0 ? scored[myIndex - 1] : null;
  const gap = above && me ? Math.max(above.points - me.points, 0) : 0;
  const suggestions = config ? computeGapSuggestions(gap, config.leaderboardWeights) : [];

  // Evaluation engine -- port of evaluateMyAchievements() (index.html:
  // 19687-19713). Runs once per Portfolio visit rather than on a timer,
  // re-checking from scratch every time (cheap for a small team, and
  // award()'s ignoreDuplicates upsert makes re-checking an already-
  // earned one a silent no-op) -- deliberately diverges from index.html
  // in one way: it ALSO runs in demo mode (index.html skips this
  // entirely when DEMO_MODE), since demo mode is this app's primary way
  // to verify a feature works at all.
  const evaluatedRef = useRef(false);
  useEffect(() => {
    if (evaluatedRef.current || !profile || !me || !defsQuery.data || !earnedQuery.data) return;
    evaluatedRef.current = true;
    const earnedIds = new Set(earnedQuery.data.map((e) => e.achievementId));
    const ds = getDataSource(demoMode);
    (async () => {
      let awardedAny = false;
      for (const def of defsQuery.data ?? []) {
        if (!def.active || earnedIds.has(def.id)) continue;
        const val = (me as Record<string, unknown>)[def.criteriaType] as number | undefined;
        const threshold = def.criteriaConfig?.threshold;
        if (val == null || threshold == null || val < threshold) continue;
        const rec = await ds.achievements.award(profile.key, profile.name, def.id, { value: val, threshold }).catch(() => null);
        if (rec) awardedAny = true;
      }
      if (awardedAny) queryClient.invalidateQueries({ queryKey: ['staffAchievements', myKey] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, me, defsQuery.data, earnedQuery.data]);

  return {
    isLoading: rowsQuery.isLoading || defsQuery.isLoading || earnedQuery.isLoading || !config,
    rank: myIndex >= 0 ? myIndex + 1 : null,
    totalRanked: scored.length,
    points: me?.points ?? 0,
    aboveName: above?.staffName ?? null,
    gap,
    suggestions,
    defs: defsQuery.data ?? [],
    earned: earnedQuery.data ?? [],
  };
}
