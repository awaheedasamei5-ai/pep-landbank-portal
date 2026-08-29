import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Small slice of index.html's kpisOf()/agentHome() hero stats -- just
// pipeline value, enough for Phase 1's HeroCard.
export function usePipelineSummary() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['pipelineSummary', agentKey],
    enabled: !!agentKey,
    queryFn: async () => {
      const ds = getDataSource(demoMode);
      const leads = await ds.leads.listForAgent(agentKey);
      const pipelineValue = leads.reduce((s, l) => s + l.grandTotal, 0);
      return { pipelineValue, leadCount: leads.length };
    },
  });
}
