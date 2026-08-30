import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Company-wide leads, every agent -- the real drill-down destination for
// Manager Home's "Pipeline by stage" donut and "By agent" rows, which
// previously had nowhere real to link to (a manager had no screen at all
// for browsing leads outside their own, only the per-agent "My pipeline").
// Uses the same ds.leads.listAll() the Log Payment lead-picker already
// relies on under real RLS (manager sees every lead, confirmed live).
export function useManagerPipeline() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['managerPipeline'], queryFn: () => getDataSource(demoMode).leads.listAll() });
}
