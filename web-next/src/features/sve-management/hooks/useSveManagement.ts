import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

export function useSveVisits() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['sveVisits'], queryFn: () => getDataSource(demoMode).sve.listVisitsWithStatus() });
}

export function useSendSveInvite() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ siteVisitId, clientName, clientContact }: { siteVisitId: string; clientName: string; clientContact: string }) =>
      getDataSource(demoMode).sve.createInvite(siteVisitId, clientName, clientContact, profile?.key ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sveVisits'] }),
  });
}
