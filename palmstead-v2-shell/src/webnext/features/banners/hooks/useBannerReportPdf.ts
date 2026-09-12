"use client";

import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildBannerReportPdf, bannerReportFilename } from '../lib/bannerReportPdf';
import type { Banner } from '../../../types/domain';

export function useDownloadBannerReportPdf() {
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (banners: Banner[]) => {
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the report from generating.
      }
      const doc = buildBannerReportPdf(banners, logo, profile?.name);
      doc.save(bannerReportFilename());
    },
  });
}
