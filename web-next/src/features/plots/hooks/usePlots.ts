import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

export function usePlots() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);

  return useQuery({
    queryKey: ['plots'],
    // Real RLS restricts this to manager + elias/emmanuel -- gate the
    // query itself, not just the UI, so an ungated agent never even fires
    // a request that RLS would silently empty-out anyway.
    enabled: !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel'),
    queryFn: () => getDataSource(demoMode).plots.list(),
  });
}
