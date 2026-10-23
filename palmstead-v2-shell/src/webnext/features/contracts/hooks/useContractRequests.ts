import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewContractRequest } from '../../../types/domain';

// Real contract_requests_upd RLS: manager or the 'elizabeth' key only --
// same special-key pattern Plot Inventory already uses for elias/emmanuel.
export function useCanFulfilContracts(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return !!profile && (profile.role === 'manager' || profile.key === 'elizabeth');
}

export function useContractRequests() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const viewerKey = profile?.key ?? '';
  return useQuery({
    queryKey: ['contractRequests', viewerKey],
    enabled: !!profile,
    // Live mode ignores the args (RLS scopes it for real); demo mode needs
    // them explicitly since there's no RLS to fall back on.
    queryFn: () => getDataSource(demoMode).contractRequests.list(viewerKey, profile?.role ?? 'agent'),
  });
}

export function useCreateContractRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewContractRequest) => getDataSource(demoMode).contractRequests.create(agentKey, agentName, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractRequests'] }),
  });
}

export function useFulfilContractRequest() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).contractRequests.fulfil(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractRequests'] }),
  });
}
