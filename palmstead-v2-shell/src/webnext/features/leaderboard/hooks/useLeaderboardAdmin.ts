import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { LeaderboardScoreHistoryEntry } from '../../../types/domain';

// Raw unscored rows for the current year, fetched once so the admin
// screen's weight sliders can preview a hypothetical reorder instantly
// (via agentPoints(), client-side) without a round trip per keystroke.
// This is the one legitimate remaining use of agentPoints() outside demo
// mode -- see leaderboardLogic.ts's own note on why.
export function useLeaderboardRawRows(year: number) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['leaderboardRawRows', year, demoMode],
    queryFn: () => getDataSource(demoMode).manager.leaderboardRows(`${year}-01-01`, `${year}-12-31`),
  });
}

// Real audit trail -- see leaderboardScoreHistory()'s own doc comment in
// data/source.ts for why demo mode always returns [].
export function useLeaderboardScoreHistory(limit = 25) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['leaderboardScoreHistory', limit, demoMode],
    queryFn: () => getDataSource(demoMode).manager.leaderboardScoreHistory(limit),
  });
}

// AI-drafted flag text for one already-flagged spike (see
// leaderboardLogic.ts's isScoreSpike() -- deterministic, decided before
// this ever runs). Only called for entries that already passed that
// check, never for every history row, so a quiet week never spends a
// Groq call. Same graceful-null-on-no-client pattern as
// useCommissionExplainer -- demo mode and an unconfigured Groq key both
// simply show no alert text rather than an error.
export function useLeaderboardSpikeAlert(entry: LeaderboardScoreHistoryEntry | null) {
  return useQuery({
    queryKey: ['leaderboardSpikeAlert', entry?.id],
    enabled: !!entry,
    staleTime: 1000 * 60 * 30,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !entry) return null;
      const { data: res, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'leaderboard_spike_alert',
          context: {
            staffName: entry.staffName,
            oldPoints: entry.oldPoints,
            newPoints: entry.newPoints,
            delta: entry.newPoints - entry.oldPoints,
            periodFrom: entry.periodFrom,
            periodTo: entry.periodTo,
          },
        },
      });
      if (error) return null;
      const message = (res as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
