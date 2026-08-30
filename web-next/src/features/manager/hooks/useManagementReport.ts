import { useMutation } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from './useConfigSettings';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { computeManagementReportData, priorPeriodRange, type ReportRange } from '../lib/managementReportLogic';
import { buildManagementReportPdf, managementReportFilename } from '../lib/managementReportPdf';

// Fetches everything fresh on every generate (same reasoning as the
// Company Report Excel hook) -- a manager could generate this right
// after logging an approval and it should reflect current state, not a
// stale cache from a screen they haven't visited this session.
export function useDownloadManagementReport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  return useMutation({
    mutationFn: async ({ range, compare }: { range: ReportRange; compare: boolean }) => {
      const ds = getDataSource(demoMode);
      const [leads, payments, siteVisits, staff, fundRequests] = await Promise.all([
        ds.leads.listAll(),
        ds.payments.listAll(),
        ds.siteVisits.listAll(),
        ds.staff.list(),
        ds.fundRequests.list(profile?.key ?? '', profile?.role ?? 'agent'),
      ]);
      const nameFor = new Map(staff.map((s) => [s.key, s.name]));
      const resolve = (key: string) => nameFor.get(key) ?? key;

      const data = computeManagementReportData(leads, payments, siteVisits, fundRequests, range.from, range.to, resolve);

      let prior: ReportRange | null = null;
      let priorData = null;
      if (compare) {
        prior = priorPeriodRange(range);
        priorData = computeManagementReportData(leads, payments, siteVisits, fundRequests, prior.from, prior.to, resolve);
      }

      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/logo.png');
      } catch {
        // Missing logo shouldn't stop the report from generating.
      }

      const doc = buildManagementReportPdf(range, data, prior, priorData, profile?.name ?? 'Management', config?.quoteCompanyName, logo);
      doc.save(managementReportFilename(range));
    },
  });
}
