import { useMutation, useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { downloadBlob, arrayBufferToDataUri } from '../../../shared/lib/download';
import { useLogDownload } from '../../../shared/hooks/useLogDownload';
import { today } from '../../../shared/lib/format';
import { buildCanonicalPipelineWorkbook, canonicalPipelineFilename } from '../lib/pipelineCanonicalWorkbook';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Same agent roster (key+name, role==='agent' only) every Reports-adjacent
// screen needs for a "filter/tag by agent" picker -- kept local rather
// than reusing useTeamRoster() since that includes inactive/manager rows
// this screen has no use for.
export function usePipelineAgents() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['pipelineAgents'],
    queryFn: async () => {
      const staff = await getDataSource(demoMode).staff.listAll();
      return staff.filter((s) => s.role === 'agent').map((a) => ({ key: a.key, name: a.name }));
    },
  });
}

export function useDownloadMasterPipeline() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const logDownload = useLogDownload();
  return useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in.');
      const ds = getDataSource(demoMode);
      const [leads, payments, allocations, staff] = await Promise.all([ds.leads.listAll(), ds.payments.listAll(), ds.allocationRequests.list(profile.key, profile.role), ds.staff.listAll()]);
      const { buffer } = await buildCanonicalPipelineWorkbook({
        leads,
        payments,
        allocations,
        staff: staff.map((s) => ({ key: s.key, name: s.name })),
        exportedByKey: profile.key,
        exportedByName: profile.name,
        sourceLabel: 'Master Pipeline (company-wide)',
      });
      const filename = canonicalPipelineFilename('Master', today());
      downloadBlob(new Blob([buffer], { type: XLSX_MIME }), filename);
      logDownload(filename, 'excel', arrayBufferToDataUri(buffer, XLSX_MIME));
      return leads.length;
    },
  });
}

export function useDownloadAgentPipeline() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const logDownload = useLogDownload();
  return useMutation({
    mutationFn: async ({ agentKey, agentName }: { agentKey: string; agentName: string }) => {
      if (!profile) throw new Error('Not signed in.');
      const ds = getDataSource(demoMode);
      const [allLeads, allPayments, allocations, staff] = await Promise.all([ds.leads.listAll(), ds.payments.listAll(), ds.allocationRequests.list(profile.key, profile.role), ds.staff.listAll()]);
      const leads = allLeads.filter((l) => l.agent === agentKey);
      const leadIds = new Set(leads.map((l) => l.id));
      const payments = allPayments.filter((p) => leadIds.has(p.leadId));
      const { buffer } = await buildCanonicalPipelineWorkbook({
        leads,
        payments,
        allocations: allocations.filter((a) => a.agentKey === agentKey),
        staff: staff.map((s) => ({ key: s.key, name: s.name })),
        exportedByKey: profile.key,
        exportedByName: profile.name,
        sourceLabel: `${agentName}'s pipeline`,
      });
      const filename = canonicalPipelineFilename(agentName, today());
      downloadBlob(new Blob([buffer], { type: XLSX_MIME }), filename);
      logDownload(filename, 'excel', arrayBufferToDataUri(buffer, XLSX_MIME));
      return leads.length;
    },
  });
}
