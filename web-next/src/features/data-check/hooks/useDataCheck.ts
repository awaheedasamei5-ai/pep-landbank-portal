import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { runDataIntegrityCheck } from '../lib/dataIntegrityCheck';
import type { DataIssue } from '../lib/dataIntegrityCheck';
import type { Lead } from '../../../types/domain';

interface DataCheckResult {
  issues: DataIssue[];
  totalLeads: number;
  hygieneScore: number;
  isLoading: boolean;
  // dismissIssue() writes straight to localStorage (no query/state backs
  // it), so nothing would tell the issues useMemo below to recompute --
  // call this right after dismissing to make it re-filter.
  notifyDismissed: () => void;
}

// Company-wide for manager (matches renderDataCheck(null) in index.html --
// scans every agent's leads), agent-scoped otherwise (matches
// renderDataCheck(DB.leads), the agent's own pipeline only).
export function useDataCheck(): DataCheckResult {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = profile?.role === 'manager';
  const agentKey = profile?.key ?? '';

  const { data: config } = useConfig();
  const { data: staff } = useStaffDirectory();
  const nameFor = useMemo(() => new Map((staff ?? []).map((s) => [s.key, s.name])), [staff]);
  const [dismissTick, setDismissTick] = useState(0);

  const leadsQuery = useQuery({
    queryKey: ['dataCheckLeads', isManager, agentKey],
    enabled: !!profile,
    queryFn: (): Promise<Lead[]> => {
      const ds = getDataSource(demoMode);
      return isManager ? ds.leads.listAll() : ds.leads.listForAgent(agentKey);
    },
  });
  const paymentsQuery = useQuery({
    queryKey: ['dataCheckPayments'],
    queryFn: () => getDataSource(demoMode).payments.listAll(),
  });
  const siteVisitsQuery = useQuery({
    queryKey: ['dataCheckSiteVisits'],
    queryFn: () => getDataSource(demoMode).siteVisits.listAll(),
  });

  const isLoading = leadsQuery.isLoading || paymentsQuery.isLoading || siteVisitsQuery.isLoading || !config;

  const issues = useMemo(() => {
    if (!config || !leadsQuery.data || !paymentsQuery.data || !siteVisitsQuery.data) return [];
    return runDataIntegrityCheck(leadsQuery.data, paymentsQuery.data, siteVisitsQuery.data, config, (key) => nameFor.get(key) ?? key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, leadsQuery.data, paymentsQuery.data, siteVisitsQuery.data, nameFor, dismissTick]);

  const totalLeads = leadsQuery.data?.length ?? 0;
  const flaggedCount = new Set(issues.map((i) => i.leadId)).size;
  const hygieneScore = totalLeads ? Math.round(((totalLeads - flaggedCount) / totalLeads) * 100) : 100;

  return { issues, totalLeads, hygieneScore, isLoading, notifyDismissed: () => setDismissTick((n) => n + 1) };
}
