import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';

// docs/plans/23-analytics-plan.md §4 -- `manager_daily_briefing` is a
// real kind already live on the shared `ai-insights` Edge Function
// (confirmed via get_edge_function, 2026-10-24), whose own system
// prompt describes exactly this page's data shape ("total leads,
// outstanding balance, fully-paid count, open complaints, total
// pipeline value, site visits logged, this month's collected amount
// and its trend vs last month, the pipeline stage funnel, and a ranked
// list of agents by their pipeline value") -- field-for-field
// useAnalyticsOverview()'s own return shape. It was never wired to any
// screen anywhere in this shell until now. Same graceful-null-on-
// unconfigured pattern as every other AI hook here (closest structural
// twin: useLeaderboardGapCoach).
export interface ManagerBriefingInput {
  totalLeads: number;
  outstanding: number;
  fullyPaidCount: number;
  openComplaints: number;
  pipelineValue: number;
  siteVisitsCount: number;
  collectedThisMonth: number;
  collectedTrend: number[];
  stageFunnel: { stage: string; count: number }[];
  byAgent: { name: string; value: number }[];
}

export function useManagerDailyBriefing(input: ManagerBriefingInput | null) {
  return useQuery({
    queryKey: ['managerDailyBriefing', input?.totalLeads, input?.outstanding, input?.collectedThisMonth],
    enabled: !!input,
    staleTime: 1000 * 60 * 30,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !input) return null;
      const { data: res, error } = await client.functions.invoke('ai-insights', {
        body: { kind: 'manager_daily_briefing', context: input },
      });
      if (error) return null;
      const message = (res as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
