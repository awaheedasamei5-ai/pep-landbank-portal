import { useMutation, useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { downloadBlob } from '../../../shared/lib/download';
import { today } from '../../../shared/lib/format';
import { agentPipelineFilename, buildAgentPipelineExcel, buildMasterPipelineExcel, masterPipelineFilename } from '../lib/pipelineTemplateExcel';

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
  return useMutation({
    mutationFn: async () => {
      const ds = getDataSource(demoMode);
      const [leads, staff] = await Promise.all([ds.leads.listAll(), ds.staff.listAll()]);
      const nameByKey = new Map(staff.map((s) => [s.key, s.name]));
      const tagged = leads.map((l) => ({ ...l, agentTag: nameByKey.get(l.agent) ?? l.agent }));
      const buffer = await buildMasterPipelineExcel(tagged);
      downloadBlob(new Blob([buffer], { type: XLSX_MIME }), masterPipelineFilename(today()));
      return tagged.length;
    },
  });
}

export function useDownloadAgentPipeline() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useMutation({
    mutationFn: async ({ agentKey, agentName }: { agentKey: string; agentName: string }) => {
      const leads = await getDataSource(demoMode).leads.listAll();
      const agentLeads = leads.filter((l) => l.agent === agentKey);
      const buffer = await buildAgentPipelineExcel(agentLeads);
      downloadBlob(new Blob([buffer], { type: XLSX_MIME }), agentPipelineFilename(agentName, today()));
      return agentLeads.length;
    },
  });
}
