import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildSiteVisitFormPdf, siteVisitFormFilename } from '../lib/siteVisitFormPdf';
import type { SiteVisit } from '../../../types/domain';

// Master Spec 9.3's own confirmation requirement ("show confirmation with
// date, time, client and logistics") plus v1's real behavior of attaching
// this exact PDF to the staff notify message (index.html:16255-16257) --
// here it's a plain download the staff member can keep/forward themselves.
export function useDownloadSiteVisitFormPdf() {
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (rec: SiteVisit) => {
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/trulander-logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the form from generating.
      }
      const doc = buildSiteVisitFormPdf(rec, profile?.name ?? '', logo);
      doc.save(siteVisitFormFilename(rec.name));
    },
  });
}
