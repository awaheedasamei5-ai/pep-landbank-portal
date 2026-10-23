import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { runDataIntegrityCheck } from '../lib/dataIntegrityCheck';
import type { DataIssue } from '../lib/dataIntegrityCheck';
import type { Lead } from '../../../types/domain';

// docs/plans/19-data-check-plan.md -- company-wide for a manager
// (matches renderDataCheck(null) in index.html, scans every agent's
// leads), agent-scoped otherwise (renderDataCheck(DB.leads), the
// agent's own pipeline only). Real server-side dismiss state (not
// localStorage) -- see data_check_dismissals' own RLS comment for why
// a manager's dismissal needs to carry a real is_company_wide flag.
export function useDataCheck() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = profile?.role === 'manager';
  const agentKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  const { data: config } = useConfig();
  const { data: staff } = useStaffDirectory();
  const nameFor = useMemo(() => new Map((staff ?? []).map((s) => [s.key, s.name])), [staff]);

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
  const dismissalsQuery = useQuery({
    queryKey: ['dataCheckDismissals'],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).dataCheckDismissals.list(),
  });

  const isLoading = leadsQuery.isLoading || paymentsQuery.isLoading || siteVisitsQuery.isLoading || dismissalsQuery.isLoading || !config;

  const allIssues = useMemo(() => {
    if (!config || !leadsQuery.data || !paymentsQuery.data || !siteVisitsQuery.data) return [];
    return runDataIntegrityCheck(leadsQuery.data, paymentsQuery.data, siteVisitsQuery.data, config, (key) => nameFor.get(key) ?? key);
  }, [config, leadsQuery.data, paymentsQuery.data, siteVisitsQuery.data, nameFor]);

  const dismissedKeys = useMemo(() => new Set((dismissalsQuery.data ?? []).map((d) => `${d.leadId}_${d.issueType}`)), [dismissalsQuery.data]);
  const issues = useMemo(() => allIssues.filter((i) => !dismissedKeys.has(`${i.leadId}_${i.type}`)), [allIssues, dismissedKeys]);

  const dismiss = useMutation({
    mutationFn: (issue: DataIssue) => {
      if (!profile) throw new Error('Not signed in');
      return getDataSource(demoMode).dataCheckDismissals.create(issue.leadId, issue.type, profile.key, profile.name, isManager);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dataCheckDismissals'] }),
  });

  const totalLeads = leadsQuery.data?.length ?? 0;
  const flaggedCount = new Set(issues.map((i) => i.leadId)).size;
  const hygieneScore = totalLeads ? Math.round(((totalLeads - flaggedCount) / totalLeads) * 100) : 100;

  return { issues, totalLeads, hygieneScore, isLoading, dismiss };
}
