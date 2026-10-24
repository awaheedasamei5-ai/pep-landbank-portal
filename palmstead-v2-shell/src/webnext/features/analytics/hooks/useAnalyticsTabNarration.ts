import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';

// docs/plans/27-analytics-v2-cross-app-plan.md -- 3 new AI kinds
// (deployed alongside Smart Insights v2's smart_insight_action this
// session), one per new tab. Same graceful-null-on-unconfigured
// pattern as every other AI hook in this app.
export function useAnalyticsTabNarration(kind: 'analytics_sales_activity_summary' | 'analytics_team_summary' | 'analytics_operations_summary', context: Record<string, unknown> | null) {
  return useQuery({
    queryKey: [kind, context],
    enabled: !!context,
    staleTime: 1000 * 60 * 30,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !context) return null;
      const { data: res, error } = await client.functions.invoke('ai-insights', { body: { kind, context } });
      if (error) return null;
      const message = (res as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
