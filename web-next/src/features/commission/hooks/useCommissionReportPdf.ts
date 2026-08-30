import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildCommissionReportPdf, commissionReportFilename } from '../lib/commissionReportPdf';
import type { CompanyCommissionReport } from '../../../types/domain';

export function useDownloadCommissionReport() {
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  return useMutation({
    mutationFn: async (data: CompanyCommissionReport) => {
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/logo.png');
      } catch {
        // Missing logo shouldn't stop the report from generating.
      }
      const doc = buildCommissionReportPdf(data, profile?.name ?? 'Management', config?.quoteCompanyName, logo);
      doc.save(commissionReportFilename(data.monthKey));
    },
  });
}
