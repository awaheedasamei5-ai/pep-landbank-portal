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

// Port of v1's "Monthly price adjustment" (apiBulkAdjust) -- Management's
// manual, one-time bulk discount/price-increase applied to every lead
// with an outstanding balance. Real money-affecting action -- deliberately
// requires its own explicit confirmation in the UI, not just this hook.
export function useBulkAdjustPrice() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ plotType, mode, amountPerPlot }: { plotType: 'Both' | 'Full Plot' | 'Half Plot'; mode: 'discount' | 'increase'; amountPerPlot: number }) =>
      getDataSource(demoMode).leads.bulkAdjustPrice(plotType, mode, amountPerPlot),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leadsAll'] });
    },
  });
}
