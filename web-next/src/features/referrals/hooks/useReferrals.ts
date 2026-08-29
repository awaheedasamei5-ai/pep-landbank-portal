import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewReferral } from '../../../types/domain';

export function useReferrals() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['referrals', agentKey],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).referrals.listForAgent(agentKey),
  });
}

export function useCreateReferral() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewReferral) => getDataSource(demoMode).referrals.create(agentKey, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals', agentKey] });
    },
  });
}
