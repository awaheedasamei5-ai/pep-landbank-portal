import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { agentPoints } from '../lib/leaderboardLogic';
import type { LeaderboardRow } from '../../../types/domain';

// Combines the raw leaderboard_rows() RPC with the real leaderboard_weights
// config, scoring + sorting client-side (agentPoints, ported exactly from
// index.html) so this can never disagree with the Performance tab's own
// self-rank once that's built -- both would read the same two sources.
export function useLeaderboard(year: number) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['leaderboard', year, demoMode],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const ds = getDataSource(demoMode);
      const [rawRows, config] = await Promise.all([ds.manager.leaderboardRows(`${year}-01-01`, `${year}-12-31`), ds.config.get()]);
      return rawRows.map((row) => ({ ...row, points: agentPoints(row, config.leaderboardWeights) })).sort((a, b) => b.points - a.points);
    },
  });
}
