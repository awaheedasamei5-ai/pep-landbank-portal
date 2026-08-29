import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewLead } from '../../../types/domain';

export function useLeads() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['leads', agentKey],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).leads.listForAgent(agentKey),
  });
}

export function useCreateLead() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewLead) => getDataSource(demoMode).leads.create(agentKey, input),
    onSuccess: () => {
      // Same "one funnel, invalidate on write" pattern the realtime bridge
      // will use once live subscriptions exist (see data/realtime/ in a
      // later phase) -- for demo mode this just re-reads the updated array.
      queryClient.invalidateQueries({ queryKey: ['leads', agentKey] });
      queryClient.invalidateQueries({ queryKey: ['pipelineSummary', agentKey] });
    },
  });
}
