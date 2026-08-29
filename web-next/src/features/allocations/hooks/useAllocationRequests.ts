import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewAllocationRequest } from '../../../types/domain';

// Same real gate as Plot Inventory (alloc_sel/alloc_upd RLS, confirmed live).
export function useCanAllocatePlots(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return !!profile && (profile.role === 'manager' || ['elias', 'emmanuel'].includes(profile.key));
}

export function useAllocationRequests() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const viewerKey = profile?.key ?? '';
  return useQuery({
    queryKey: ['allocationRequests', viewerKey],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).allocationRequests.list(viewerKey, profile?.role ?? 'agent'),
  });
}

export function useCreateAllocationRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewAllocationRequest) => getDataSource(demoMode).allocationRequests.create(agentKey, agentName, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allocationRequests'] }),
  });
}

export function useAllocatePlot() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, plotNumber, note }: { id: string; plotNumber: string; note?: string }) => getDataSource(demoMode).allocationRequests.allocate(id, plotNumber, note, profile?.name ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allocationRequests'] }),
  });
}
