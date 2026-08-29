import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { ComplaintUpdate, NewComplaint } from '../../../types/domain';

export function useComplaints() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['complaints', agentKey],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).complaints.listForAgent(agentKey),
  });
}

export function useCreateComplaint() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewComplaint) => getDataSource(demoMode).complaints.create(agentKey, agentName, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['complaints', agentKey] }),
  });
}

export function useUpdateComplaint() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ComplaintUpdate }) => getDataSource(demoMode).complaints.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['complaints', agentKey] }),
  });
}
