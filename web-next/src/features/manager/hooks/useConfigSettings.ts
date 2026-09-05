import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { Config, PricingPromotion } from '../../../types/domain';

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

// Port of v1's Price change history -- one row per changed field, logged
// by the caller after a successful config.update() (see SettingsScreen's
// own save handler, which diffs old vs new and calls this once per field
// that actually changed).
export function usePricingHistory() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['pricingHistory'], queryFn: () => getDataSource(demoMode).pricingHistory.list() });
}

export function useLogPricingChange() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ field, fieldLabel, oldValue, newValue }: { field: string; fieldLabel: string; oldValue: number; newValue: number }) =>
      getDataSource(demoMode).pricingHistory.log(profile?.key ?? '', profile?.name ?? '', field, fieldLabel, oldValue, newValue),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pricingHistory'] }),
  });
}

// Real feature request, replacing the earlier "Monthly price adjustment"
// (which bulk-mutated every existing outstanding lead immediately -- the
// opposite of what was actually wanted): a promo window Management sets
// up once (plot type, discount/increase, amount, date range) that only
// ever affects leads CREATED inside that window, via AddLeadScreen's own
// lookup -- never a mutation against any lead already in the system.
export function usePricingPromotions() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['pricingPromotions'], queryFn: () => getDataSource(demoMode).pricingPromotions.list() });
}

export function useCreatePricingPromotion() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<PricingPromotion, 'id' | 'createdBy' | 'createdByName' | 'createdAt'>) =>
      getDataSource(demoMode).pricingPromotions.create(profile?.key ?? '', profile?.name ?? '', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pricingPromotions'] }),
  });
}

export function useDeletePricingPromotion() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).pricingPromotions.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pricingPromotions'] }),
  });
}
