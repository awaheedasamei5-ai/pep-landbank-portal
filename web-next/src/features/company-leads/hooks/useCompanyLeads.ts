import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Real leads_upd_company RLS (confirmed live): manager or
// elias/emmanuel/elizabeth, same roster as canViewClientDatabase() in
// index.html -- distinct from Plot Inventory's manager/elias/emmanuel
// (no elizabeth there), two genuinely different real permission sets.
export function useCanManageCompanyLeads(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return !!profile && (profile.role === 'manager' || ['elias', 'emmanuel', 'elizabeth'].includes(profile.key));
}

export function useCompanyLeads() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['companyLeads'], queryFn: () => getDataSource(demoMode).leads.listCompany() });
}

// Reuses the existing staff.list() (Memorandum's recipient picker already
// established this real, unfiltered `profiles` read) rather than adding a
// second, narrower staff-fetch method -- just filters to agents here.
export function useAgentRoster() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['agentRoster'],
    queryFn: async () => (await getDataSource(demoMode).staff.list()).filter((p) => p.role === 'agent'),
  });
}

export function useAssignCompanyLead() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, agentKey }: { id: string; agentKey: string }) => getDataSource(demoMode).leads.assign(id, agentKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companyLeads'] }),
  });
}

export function useSetLeadSource() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, source }: { id: string; source: string }) => getDataSource(demoMode).leads.setSource(id, source),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companyLeads'] }),
  });
}
