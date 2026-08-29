import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewSiteVisit } from '../../../types/domain';

export function useSiteVisits() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['siteVisits', agentKey],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).siteVisits.listForAgent(agentKey),
  });
}

export function useCreateSiteVisit() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewSiteVisit) => getDataSource(demoMode).siteVisits.create(agentKey, agentName, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siteVisits', agentKey] });
    },
  });
}
