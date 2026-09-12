"use client";

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

// Real v1 audit trail (apiLoadBannerStatusLog) -- every status change
// logged against one banner, newest first.
export function useBannerStatusLog(bannerId: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['bannerStatusLog', bannerId],
    queryFn: () => getDataSource(demoMode).banners.statusLog(bannerId),
    enabled: !!bannerId,
  });
}

// Real v1 behavior (apiLogBannerStatusUpdate, called both from the "Add
// banner" modal's initial entry and the detail screen's own "Log a
// status update" form) -- writes a banner_status_log row AND keeps the
// banner's own current status/image/updated_at in sync with it.
export function useLogBannerStatusUpdate() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bannerId, status, note, images }: { bannerId: string; status: BannerStatus; note: string; images: string[] }) =>
      getDataSource(demoMode).banners.logStatusUpdate(bannerId, profile?.key ?? '', profile?.name ?? '', { status, note, images }),
    onSuccess: (_entry, { bannerId }) => {
      qc.invalidateQueries({ queryKey: ['banners'] });
      qc.invalidateQueries({ queryKey: ['bannerStatusLog', bannerId] });
    },
  });
}