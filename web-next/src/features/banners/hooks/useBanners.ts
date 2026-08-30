import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { BannerStatus, NewBanner } from '../../../types/domain';

// Real RLS (banners_sel, confirmed live): open to any authenticated staff
// member, unlike Plot Inventory -- no role gate needed here.
export function useBanners() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['banners'],
    queryFn: () => getDataSource(demoMode).banners.list(),
  });
}

export function useLeadBannerCounts() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['leadBannerCounts'],
    queryFn: () => getDataSource(demoMode).leadBannerCounts(),
  });
}

export function useCreateBanner() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewBanner) => getDataSource(demoMode).banners.create(profile?.key ?? '', profile?.name ?? '', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banners'] }),
  });
}

export function useUpdateBannerStatus() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BannerStatus }) => getDataSource(demoMode).banners.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banners'] }),
  });
}
