import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import type { SmartInsight } from '../lib/smartInsightsLogic';

// docs/plans/26-smart-insights-v2-cross-app-plan.md -- kind
// `smart_insight_action`, confirmed live on the shared `ai-insights`
// function (deployed this session). Deterministic insight generation
// stays 100% in smartInsightsLogic.ts; this only adds a one-line
// suggested action per card. Graceful null on unconfigured/demo, same
// pattern as every other AI hook in this app.
export function useSmartInsightAction(insight: SmartInsight | null) {
  return useQuery({
    queryKey: ['smartInsightAction', insight?.key, insight?.text],
    enabled: !!insight,
    staleTime: 1000 * 60 * 30,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !insight) return null;
      const { data: res, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'smart_insight_action',
          context: {
            kind: insight.crossAppKind ?? insight.kind ?? insight.key,
            app: insight.app ?? 'Sales',
            text: insight.text,
            detail: insight.detail ?? '',
          },
        },
      });
      if (error) return null;
      const message = (res as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
