import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { computeSmartInsights, getInsightLists, type InsightKind } from '../lib/smartInsightsLogic';

// Company-wide for a manager, own pipeline otherwise -- matches index.
// html's own scope split (renderSmartInsights(allAgentLists()...) on
// Manager Home vs renderSmartInsights(DB.leads...) on agent Home).
export function useSmartInsights() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = profile?.role === 'manager';
  const agentKey = profile?.key ?? '';

  const leadsQuery = useQuery({
    queryKey: ['smartInsightsLeads', isManager, agentKey],
    enabled: !!profile,
    queryFn: () => {
      const ds = getDataSource(demoMode);
      return isManager ? ds.leads.listAll() : ds.leads.listForAgent(agentKey);
    },
  });
  const paymentsQuery = useQuery({
    queryKey: ['smartInsightsPayments', isManager, agentKey],
    enabled: !!profile,
    queryFn: () => {
      const ds = getDataSource(demoMode);
      return isManager ? ds.payments.listAll() : ds.payments.listForAgent(agentKey);
    },
  });

  const insights = useMemo(() => (leadsQuery.data && paymentsQuery.data ? computeSmartInsights(leadsQuery.data, paymentsQuery.data) : []), [leadsQuery.data, paymentsQuery.data]);

  return { insights, isLoading: leadsQuery.isLoading || paymentsQuery.isLoading, leads: leadsQuery.data ?? [] };
}

export function useInsightList(kind: InsightKind) {
  const { leads, isLoading } = useSmartInsights();
  const list = useMemo(() => getInsightLists(leads)[kind], [leads, kind]);
  return { list, isLoading };
}
