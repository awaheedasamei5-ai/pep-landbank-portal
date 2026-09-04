import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { ManagerOverview } from '../../../types/domain';

// Real LLM-backed daily briefing for Manager Home, via the same
// ai-insights Edge Function the streak coaching line and colleague-
// availability check already use (kind='manager_daily_briefing', added
// 2026-09-04 -- see supabase/functions/ai-insights). Same orthogonal-to-
// DataSource shape as useStreakCoaching.ts: relays an already-computed
// summary to an external model, calls the Supabase client directly, and
// fails silently (data stays undefined) if the function isn't deployed,
// GROQ_API_KEY isn't set, or the call times out -- Manager Home must
// never break because the AI layer is unavailable.
export function useManagerBriefing(overview: ManagerOverview | undefined) {
  const profile = useSessionStore((s) => s.profile);

  return useQuery({
    queryKey: ['managerBriefing', overview?.totalLeads, overview?.collected, overview?.openComplaints, overview?.pipelineValue],
    enabled: !!overview && !!profile,
    staleTime: 1000 * 60 * 30,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !overview) return null;
      const topAgent = [...overview.byAgent].sort((a, b) => b.value - a.value)[0] ?? null;
      const trend = overview.collectedTrend;
      const collectedThisMonth = trend[trend.length - 1] ?? 0;
      const collectedLastMonth = trend[trend.length - 2] ?? 0;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'manager_daily_briefing',
          context: {
            totalLeads: overview.totalLeads,
            pipelineValue: overview.pipelineValue,
            outstanding: overview.outstanding,
            fullyPaidCount: overview.fullyPaidCount,
            openComplaints: overview.openComplaints,
            siteVisitsCount: overview.siteVisitsCount,
            collectedThisMonth,
            collectedLastMonth,
            stageFunnel: overview.stageFunnel,
            topAgentByPipelineValue: topAgent ? { name: topAgent.name, value: topAgent.value } : null,
            agentCount: overview.byAgent.length,
          },
        },
      });
      if (error) return null;
      const message = (data as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
