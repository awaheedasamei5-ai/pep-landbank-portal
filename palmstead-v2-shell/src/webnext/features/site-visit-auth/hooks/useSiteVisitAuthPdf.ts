"use client";

import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { useLogDownload } from '../../../shared/hooks/useLogDownload';
import { buildSiteVisitAuthPdf, siteVisitAuthFilename } from '../lib/siteVisitAuthPdf';
import type { SiteVisit, WeeklyVisitForm } from '../../../types/domain';

export function useDownloadSiteVisitAuthPdf() {
  const profile = useSessionStore((s) => s.profile);
  const logDownload = useLogDownload();
  return useMutation({
    mutationFn: async ({ form, visits }: { form: WeeklyVisitForm; visits: SiteVisit[] }) => {
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/trulander-logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the form from generating.
      }
      const doc = buildSiteVisitAuthPdf(form, visits, profile?.signatureData ?? null, logo, profile?.name);
      const filename = siteVisitAuthFilename(form.visitDate);
      doc.save(filename);
      logDownload(filename, 'pdf', doc.output('datauristring'));
    },
  });
}
