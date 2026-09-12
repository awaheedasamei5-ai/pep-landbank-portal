"use client";

import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { getDataSource } from '../../../data/source';
import { buildBannerReportPdf, bannerReportFilename } from '../lib/bannerReportPdf';
import type { Banner } from '../../../types/domain';

// Real production report (comment on buildBannerReportPdf): one card per
// banner with its full status-log history embedded -- status-log fetches
// are batched (Promise.all) over just the filtered set passed in, not
// every banner ever created, matching the real report's own approach.
export function useDownloadBannerReportPdf() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  return useMutation({
    mutationFn: async (banners: Banner[]) => {
      const ds = getDataSource(demoMode);
      const [logo, logs] = await Promise.all([
        loadImageAsDataUri('/logo.png').catch(() => null),
        Promise.all(banners.map((b) => ds.banners.statusLog(b.id).catch(() => []))),
      ]);
      const doc = buildBannerReportPdf(banners, logs, logo, profile?.name);
      doc.save(bannerReportFilename());
    },
  });
}
