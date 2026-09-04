import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { useSystemHealth } from './useSystemHealth';

type Health = ReturnType<typeof useSystemHealth>;

// Real LLM narration of System Health -- kind='system_health_summary' on
// the shared ai-insights function. Purely operational/technical
// aggregates (counts and booleans) cross the wire -- no client data, no
// staff personal data, nothing this screen wouldn't already show a
// manager directly.
export function useSystemHealthSummary(health: Health) {
  const profile = useSessionStore((s) => s.profile);

  return useQuery({
    queryKey: ['systemHealthSummary', profile?.key, health.criticalCount, health.jobsFailing, health.reportOverdue, health.backupOverdue, health.backupCount],
    enabled: !health.isLoading && !!profile,
    staleTime: 1000 * 60 * 15,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'system_health_summary',
          context: {
            criticalCount: health.criticalCount,
            jobsFailing: health.jobsFailing,
            reportOverdue: health.reportOverdue,
            lastReportFailed: health.lastReportFailed,
            backupOverdue: health.backupOverdue,
            backupCount: health.backupCount,
          },
        },
      });
      if (error) return null;
      const message = (data as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
