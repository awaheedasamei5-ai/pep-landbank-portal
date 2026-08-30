import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Real bug found while testing the payment-receipt feature: leads.get()
// is agent-scoped (both demo and live), so a manager opening a lead from
// Manager Home's stage/agent drill-down or Company Pipeline -- which
// correctly show every agent's leads -- got "Lead not found" the moment
// they actually clicked in, since the lookup was always keyed to the
// viewer's own agentKey, not the lead's real owner. Same fix pattern
// already used for useAllLeadsForLinking/useManagerPipeline: staff with
// company-wide visibility fetch via listAll() and find by id instead.
export function useLead(id: string) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const viewAll = !!profile && (profile.role === 'manager' || ['elias', 'emmanuel', 'elizabeth'].includes(profile.key));

  return useQuery({
    queryKey: ['lead', agentKey, id, viewAll],
    enabled: !!agentKey && !!id,
    queryFn: async () => {
      const ds = getDataSource(demoMode);
      if (viewAll) {
        const all = await ds.leads.listAll();
        return all.find((l) => l.id === id);
      }
      return ds.leads.get(agentKey, id);
    },
  });
}
