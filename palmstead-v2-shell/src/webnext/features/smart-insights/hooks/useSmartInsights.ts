import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { computeSmartInsights, getInsightLists, getCrossAppInsightList, type InsightKind, type CrossAppInsightKind, type CrossAppData } from '../lib/smartInsightsLogic';

// docs/plans/18-smart-insights-plan.md -- company-wide for a manager,
// own pipeline otherwise -- matches index.html's own scope split
// (renderSmartInsights(allAgentLists()...) on Manager Home vs
// renderSmartInsights(DB.leads...) on agent Home).
//
// docs/plans/26-smart-insights-v2-cross-app-plan.md -- the 6 new
// cross-app queries follow the same split: Complaints/Referrals/
// Allocations/Contract-of-Sale are real per-agent-owned records (RLS
// already scopes list()/listForAgent() correctly for either role), so
// every profile fetches them; Leave-pending and Banner-zero-leads are
// manager-only insights (deciding leave and reviewing campaign spend
// are Management concerns), fetched only when isManager.
export function useSmartInsights() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = profile?.role === 'manager';
  const agentKey = profile?.key ?? '';
  const role = profile?.role ?? 'agent';

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
  const complaintsQuery = useQuery({
    queryKey: ['smartInsightsComplaints', isManager, agentKey],
    enabled: !!profile,
    queryFn: () => {
      const ds = getDataSource(demoMode);
      return isManager ? ds.complaints.listAll() : ds.complaints.listForAgent(agentKey);
    },
  });
  const referralsQuery = useQuery({
    queryKey: ['smartInsightsReferrals', isManager, agentKey],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).referrals.listForAgent(agentKey, isManager),
  });
  const allocationsQuery = useQuery({
    queryKey: ['smartInsightsAllocations', isManager, agentKey],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).allocationRequests.list(agentKey, role),
  });
  const contractRequestsQuery = useQuery({
    queryKey: ['smartInsightsContractRequests', isManager, agentKey],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).contractRequests.list(agentKey, role),
  });
  const leaveRequestsQuery = useQuery({
    queryKey: ['smartInsightsLeave', isManager],
    enabled: !!profile && isManager,
    queryFn: () => getDataSource(demoMode).leaveRequests.list(),
  });
  const bannersQuery = useQuery({
    queryKey: ['smartInsightsBanners', isManager],
    enabled: !!profile && isManager,
    queryFn: () => getDataSource(demoMode).banners.list(),
  });

  const crossApp: CrossAppData = useMemo(
    () => ({
      complaints: complaintsQuery.data,
      referrals: referralsQuery.data,
      allocationRequests: allocationsQuery.data,
      contractRequests: contractRequestsQuery.data,
      leaveRequests: leaveRequestsQuery.data,
      banners: bannersQuery.data,
    }),
    [complaintsQuery.data, referralsQuery.data, allocationsQuery.data, contractRequestsQuery.data, leaveRequestsQuery.data, bannersQuery.data],
  );

  const insights = useMemo(() => (leadsQuery.data && paymentsQuery.data ? computeSmartInsights(leadsQuery.data, paymentsQuery.data, crossApp) : []), [leadsQuery.data, paymentsQuery.data, crossApp]);

  return {
    insights,
    isLoading: leadsQuery.isLoading || paymentsQuery.isLoading,
    leads: leadsQuery.data ?? [],
    crossApp,
  };
}

export function useInsightList(kind: InsightKind) {
  const { leads, isLoading } = useSmartInsights();
  const list = useMemo(() => getInsightLists(leads)[kind], [leads, kind]);
  return { list, isLoading };
}

export function useCrossAppInsightList(kind: CrossAppInsightKind) {
  const { leads, crossApp, isLoading } = useSmartInsights();
  const list = useMemo(() => getCrossAppInsightList(kind, crossApp, leads), [kind, crossApp, leads]);
  return { list, isLoading };
}
