import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewLeaveRequest } from '../../../types/domain';

export function useCanDecideLeave(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return profile?.role === 'manager';
}

export function useLeaveRequests() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['leaveRequests'], queryFn: () => getDataSource(demoMode).leaveRequests.list() });
}

export function useCreateLeaveRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewLeaveRequest) => getDataSource(demoMode).leaveRequests.create(agentKey, agentName, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}

export function useDecideLeaveRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => getDataSource(demoMode).leaveRequests.decide(id, approve, profile?.key ?? '', profile?.name ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveRequests'] }),
  });
}
