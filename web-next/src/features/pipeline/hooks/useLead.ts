import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { today } from '../../../shared/lib/format';

export function useLead(id: string) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['lead', agentKey, id],
    enabled: !!agentKey && !!id,
    queryFn: () => getDataSource(demoMode).leads.get(agentKey, id),
  });
}

export function useRecordPayment(id: string) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (amount: number) => getDataSource(demoMode).leads.recordPayment(agentKey, id, amount, today()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', agentKey, id] });
      queryClient.invalidateQueries({ queryKey: ['leads', agentKey] });
      queryClient.invalidateQueries({ queryKey: ['payments', agentKey] });
      queryClient.invalidateQueries({ queryKey: ['pipelineSummary', agentKey] });
      queryClient.invalidateQueries({ queryKey: ['todayStreak', agentKey] });
    },
  });
}
