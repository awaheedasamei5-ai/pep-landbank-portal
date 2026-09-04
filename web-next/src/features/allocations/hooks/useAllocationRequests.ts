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

// Master Spec 7.5: "Management receives in-app notification + SMS that an
// allocation request is awaiting review." Both are fire-and-forget --
// never let a failed notify/SMS roll back or block the real request that
// was just created, same "auditing must never break the calling flow"
// reasoning as every other sms.send() call site in this app.
export function useCreateAllocationRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewAllocationRequest) => {
      const ds = getDataSource(demoMode);
      const request = await ds.allocationRequests.create(agentKey, agentName, input);
      const managers = await ds.staff.list().catch(() => []);
      const toManagers = managers.filter((m) => m.role === 'manager' && m.key !== agentKey);
      if (toManagers.length > 0) {
        const body = `${agentName} requested plot allocation for ${request.clientName} — awaiting your review.`;
        ds.notifications.notify(agentKey, agentName, toManagers.map((m) => m.key), body, 'allocation_pending', 'allocation_request', request.id).catch(() => {});
        for (const mgr of toManagers) {
          if (mgr.phone) {
            ds.sms.send(mgr.phone, `${agentName} requested plot allocation for ${request.clientName}. Review it in Palmstead.`, 'allocation_pending', agentKey).catch(() => {});
          }
        }
      }
      return request;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allocationRequests'] }),
  });
}

export function useSuggestAllocationPlots() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, plotNumbers }: { id: string; plotNumbers: string[] }) => getDataSource(demoMode).allocationRequests.suggest(id, plotNumbers),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allocationRequests'] }),
  });
}

// Real SECURITY DEFINER confirm_allocation RPC also syncs the `plots` table
// -- invalidating both queries here (not just allocationRequests) is what
// makes a freshly-Allocated plot disappear from Plot Inventory's Available
// count without a manual refresh.
export function useConfirmAllocation() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, plotNumber, note }: { id: string; plotNumber: string; note?: string }) => getDataSource(demoMode).allocationRequests.confirm(id, plotNumber, note, profile?.name ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocationRequests'] });
      queryClient.invalidateQueries({ queryKey: ['plots'] });
    },
  });
}

export function useRevertAllocation() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).allocationRequests.revert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocationRequests'] });
      queryClient.invalidateQueries({ queryKey: ['plots'] });
    },
  });
}

export function useEditAllocatedPlot() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newPlotNumber }: { id: string; newPlotNumber: string }) => getDataSource(demoMode).allocationRequests.editPlot(id, newPlotNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocationRequests'] });
      queryClient.invalidateQueries({ queryKey: ['plots'] });
    },
  });
}

export function useDeleteAllocationRequest() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).allocationRequests.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocationRequests'] });
      queryClient.invalidateQueries({ queryKey: ['plots'] });
    },
  });
}

export function useFlagAllocation() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => getDataSource(demoMode).allocationRequests.flag(id, reason, profile?.name ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allocationRequests'] }),
  });
}

export function useResolveAllocationFlag() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).allocationRequests.resolveFlag(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allocationRequests'] }),
  });
}
