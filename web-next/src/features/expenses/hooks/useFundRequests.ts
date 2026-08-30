import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewFundRequest } from '../../../types/domain';

// Real UI gate (canManageExpenses in index.html) -- manager or 'elias'
// only, stricter than the real RLS (which would let any signed-in staff
// request their own funds), same precedent as Log Payment's own tighter-
// than-RLS gate.
export function useCanManageExpenses(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return !!profile && (profile.role === 'manager' || profile.key === 'elias');
}

export function useFundRequests() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const viewerKey = profile?.key ?? '';
  return useQuery({
    queryKey: ['fundRequests', viewerKey],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).fundRequests.list(viewerKey, profile?.role ?? 'agent'),
  });
}

export function useCreateFundRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewFundRequest) => getDataSource(demoMode).fundRequests.create(profile?.key ?? '', profile?.name ?? '', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fundRequests'] }),
  });
}

export function useDecideFundRequest() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) => getDataSource(demoMode).fundRequests.decide(id, approve, profile?.key ?? '', profile?.name ?? '', note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fundRequests'] }),
  });
}
