import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { useMyCommission } from './useMyCommission';

type MyCommissionData = NonNullable<ReturnType<typeof useMyCommission>['data']>;

// Real LLM-authored explainer for My Commission -- kind='commission_
// explainer' on the shared ai-insights function. Only the agent's own
// name and aggregate totals cross the wire -- never a row's clientName,
// even though the screen itself displays those per-row (the model never
// needs a client's identity to explain a total).
export function useCommissionExplainer(data: MyCommissionData | undefined, prevTotal: number | undefined, monthLabel: string) {
  const profile = useSessionStore((s) => s.profile);
  const deltaPct = prevTotal && prevTotal > 0 && data ? Math.round(((data.total - prevTotal) / prevTotal) * 100) : null;

  return useQuery({
    queryKey: ['commissionExplainer', profile?.key, data?.total, prevTotal, monthLabel],
    enabled: !!data && !!profile,
    staleTime: 1000 * 60 * 30,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !data || !profile) return null;
      const { data: res, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'commission_explainer',
          context: {
            agentName: profile.name,
            monthLabel,
            total: data.total,
            prevTotal: prevTotal ?? 0,
            deltaPct,
            paymentCount: data.rows.length,
          },
        },
      });
      if (error) return null;
      const message = (res as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
