import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

export function usePayments() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['payments', agentKey],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).payments.listForAgent(agentKey),
  });
}
