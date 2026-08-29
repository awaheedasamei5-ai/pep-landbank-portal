import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

export function useManagerOverview() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['managerOverview'], queryFn: () => getDataSource(demoMode).manager.overview() });
}
