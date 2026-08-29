import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

export function useLead(id: string) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['lead', agentKey, id],
    enabled: !!agentKey && !!id,
    queryFn: () => getDataSource(demoMode).leads.get(agentKey, id),
  });
}
