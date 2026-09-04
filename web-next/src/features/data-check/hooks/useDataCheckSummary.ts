import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { DataIssue } from '../lib/dataIntegrityCheck';

// Real LLM narration of a Data Check scan -- kind='data_check_summary' on
// the shared ai-insights function, the master spec's own named safe use
// (Section 22: "analyze imported Excel rows for anomalies after
// deterministic validation"). Only aggregate category counts cross the
// wire, grouped by issue type/severity -- never a leadName, since a data-
// hygiene finding is exactly the kind of thing that would otherwise carry
// a client's real name straight into the prompt.
export function useDataCheckSummary(issues: DataIssue[], totalLeads: number, hygieneScore: number, isLoading: boolean) {
  const profile = useSessionStore((s) => s.profile);
  const flaggedCount = new Set(issues.map((i) => i.leadId)).size;

  const byType = new Map<string, { count: number; severity: string }>();
  for (const issue of issues) {
    const existing = byType.get(issue.type);
    byType.set(issue.type, { count: (existing?.count ?? 0) + 1, severity: issue.severity });
  }
  const categories = Array.from(byType.entries()).map(([type, v]) => ({ type, count: v.count, severity: v.severity }));

  return useQuery({
    queryKey: ['dataCheckSummary', profile?.key, totalLeads, hygieneScore, categories.map((c) => `${c.type}:${c.count}`).join(',')],
    enabled: !isLoading && !!profile && totalLeads > 0,
    staleTime: 1000 * 60 * 30,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: { kind: 'data_check_summary', context: { hygieneScore, totalLeads, flaggedCount, categories } },
      });
      if (error) return null;
      const message = (data as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}
