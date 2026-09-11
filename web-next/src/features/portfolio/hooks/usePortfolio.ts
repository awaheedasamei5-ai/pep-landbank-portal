import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { computeGapSuggestions, mergeReferralConversions } from '../lib/portfolioLogic';

// Reads the same server-authoritative leaderboardScores() RPC Leaderboard
// itself uses (index.html's own comment on paintPerformanceSection makes
// this an explicit invariant: "an agent's own rank here can never
// disagree with what Management sees on the Leaderboard") -- both now
// call recompute_leaderboard_scores() directly rather than separately
// running agentPoints() client-side, so there is exactly one place
// `points` is computed. See project-leaderboard-v3-audit-and-plan memory.
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
      const [scoredRows, conversions] = await Promise.all([ds.manager.leaderboardScores(from, to), ds.manager.referralConversions(from, to)]);
      return mergeReferralConversions(scoredRows, conversions);
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
    if (!rowsQuery.data) return [];
    return [...rowsQuery.data].sort((a, b) => b.points - a.points);
  }, [rowsQuery.data]);

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
        const val = (me as unknown as Record<string, unknown>)[def.criteriaType] as number | undefined;
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

// AI-drafted coaching paragraph on top of the plain-arithmetic
// suggestions above -- same deterministic-calc/AI-drafts-language split
// as Attendance's Praise/Warning: the gap and each suggestion are real
// numbers computeGapSuggestions() already worked out, the model only
// turns the most realistic one into a motivating sentence. Same
// graceful-null pattern as useCommissionExplainer -- demo mode and an
// unconfigured Groq key both simply show no coaching text.
export function useLeaderboardGapCoach(input: { staffName: string; rank: number | null; totalRanked: number; points: number; aboveName: string | null; gap: number; suggestions: string[] } | null) {
  return useQuery({
    queryKey: ['leaderboardGapCoach', input?.staffName, input?.rank, input?.points, input?.gap],
    enabled: !!input && input.rank != null,
    staleTime: 1000 * 60 * 30,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !input) return null;
      const { data: res, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'leaderboard_gap_coach',
          context: {
            staffName: input.staffName,
            rank: input.rank,
            totalRanked: input.totalRanked,
            points: input.points,
            aboveName: input.aboveName,
            gap: input.gap,
            suggestions: input.suggestions,
          },
        },
      });
      if (error) return null;
      const message = (res as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
