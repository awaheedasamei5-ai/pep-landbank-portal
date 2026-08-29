import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewEnquiry } from '../../../types/domain';

export function useEnquiries() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['enquiries', agentKey],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).enquiries.listForAgent(agentKey),
  });
}

export function useCreateEnquiry() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewEnquiry) => getDataSource(demoMode).enquiries.create(agentKey, agentName, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enquiries', agentKey] });
    },
  });
}
