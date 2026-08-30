import { useMutation } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { downloadBlob, arrayBufferToDataUri } from '../../../shared/lib/download';
import { useLogDownload } from '../../../shared/hooks/useLogDownload';
import { buildCompanyReportExcel, companyReportFilename } from '../lib/companyReportExcel';
import type { Profile } from '../../../types/domain';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Fetches everything the Company Report workbook needs fresh (own query,
// not reusing the individual CSV-export hooks' cached data) since a
// manager could download this right after another manager's edit and it
// should reflect the current state, not a stale cache from a screen they
// haven't visited this session.
export function useDownloadCompanyReport() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const logDownload = useLogDownload();
  return useMutation({
    mutationFn: async () => {
      const ds = getDataSource(demoMode);
      const [leads, staff, config, enquiries, complaints, siteVisits] = await Promise.all([ds.leads.listAll(), ds.staff.listAll(), ds.config.get(), ds.enquiries.listAll(), ds.complaints.listAll(), ds.siteVisits.listAll()]);
      const agents = staff.filter((s: Profile) => s.role === 'agent');
      const nameByKey = new Map(staff.map((s: Profile) => [s.key, s.name]));
      const leadsWithAgentName = leads.map((l) => ({ ...l, agentName: nameByKey.get(l.agent) ?? l.agent }));
      const buffer = await buildCompanyReportExcel({
        leads: leadsWithAgentName,
        agents: agents.map((a) => ({ key: a.key, name: a.name })),
        targets: config.targets,
        enquiries,
        complaints,
        siteVisits,
        generatedByName: profile?.name ?? 'Management',
      });
      const filename = companyReportFilename();
      downloadBlob(new Blob([buffer], { type: XLSX_MIME }), filename);
      logDownload(filename, 'excel', arrayBufferToDataUri(buffer, XLSX_MIME));
    },
  });
}
