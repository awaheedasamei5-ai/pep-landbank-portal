import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { Config } from '../../../types/domain';

export function useConfig() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['config'], queryFn: () => getDataSource(demoMode).config.get() });
}

// Invalidates every screen this config feeds (Leaderboard's points formula,
// both Commission views' caps/pool) rather than a single narrow key -- a
// low-frequency admin action, so over-invalidating here costs nothing and
// guarantees nothing shows a stale number after a save.
export function useUpdateConfig() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<ReturnType<typeof getDataSource>['config']['update']>[0]) => getDataSource(demoMode).config.update(patch),
    onSuccess: (config: Config) => {
      queryClient.setQueryData(['config'], config);
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['myCommission'] });
      queryClient.invalidateQueries({ queryKey: ['companyCommission'] });
    },
  });
}
