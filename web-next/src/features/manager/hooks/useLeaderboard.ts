import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { LeaderboardRow } from '../../../types/domain';

// Server-authoritative: leaderboardScores() calls the real
// recompute_leaderboard_scores() RPC, which computes `points` itself
// (deterministic SQL, not client math) and persists it, so this can never
// disagree with the Portfolio tab's own self-rank -- both call the same
// RPC now instead of separately running agentPoints() client-side. See
// project-leaderboard-v3-audit-and-plan memory for why this changed.
export function useLeaderboard(year: number) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['leaderboard', year, demoMode],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const ds = getDataSource(demoMode);
      const rows = await ds.manager.leaderboardScores(`${year}-01-01`, `${year}-12-31`);
      return [...rows].sort((a, b) => b.points - a.points);
    },
  });
}
