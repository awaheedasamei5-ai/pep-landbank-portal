import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildStaffReportPdf, staffReportFilename } from '../lib/staffReportPdf';
import type { ReportRange } from '../../manager/lib/managementReportLogic';
import type { StaffSalesRow } from '../lib/staffReportLogic';

export function useDownloadStaffReport() {
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  return useMutation({
    mutationFn: async ({ rows, one, dayOfWeek, staffKey, range }: { rows: StaffSalesRow[]; one: StaffSalesRow | null; dayOfWeek: number[] | null; staffKey: string; range: ReportRange }) => {
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/logo.png');
      } catch {
        // Missing logo shouldn't stop the report from generating.
      }
      const doc = buildStaffReportPdf(rows, one, dayOfWeek, staffKey, range, profile?.name ?? 'Management', config?.quoteCompanyName, logo);
      doc.save(staffReportFilename(staffKey, range));
    },
  });
}
