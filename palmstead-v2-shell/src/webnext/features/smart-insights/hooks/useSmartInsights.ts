import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import { computeSmartInsights, getInsightLists, getCrossAppInsightList, type InsightKind, type CrossAppInsightKind, type CrossAppData, type IntelligenceExtras, type StaffPatternAlert } from '../lib/smartInsightsLogic';

// docs/plans/41-complete-system-findings-and-phased-fix-plan.md Phase 8
// (C2.10) -- 3 manager-only read queries for the new pattern-based
// signals. Real thresholds, not arbitrary: late check-ins grouped by
// month (attendance_log.late_reason is only ever set by the real
// check-in flow when it IS late, confirmed live), leave usage summed
// per staff for the current year (leave_requests.days_count, status =
// 'approved' only -- same "approved only" rule this app uses
// everywhere else real money/time totals are summed), and a plain
// count of real overdue Operations Tracker todos -- read-only, this
// session never writes to op_todos per the standing concurrent-
// development boundary on that subsystem.
async function fetchIntelligenceExtras(): Promise<IntelligenceExtras> {
  const client = getSupabaseClient();
  if (!client) return {};
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartIso = monthStart.toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const todayIso = new Date().toISOString().slice(0, 10);

  const [lateRes, leaveRes, opsRes] = await Promise.all([
    client.from('attendance_log').select('staff_key, staff_name').not('late_reason', 'is', null).gte('work_date', monthStartIso),
    client.from('leave_requests').select('agent_key, agent_name, days_count').eq('status', 'approved').gte('year', new Date(yearStart).getFullYear()),
    client.from('op_todos').select('id', { count: 'exact', head: true }).eq('status', 'open').lt('item_date', todayIso),
  ]);

  const lateByStaff = new Map<string, StaffPatternAlert>();
  for (const row of lateRes.data ?? []) {
    const key = row.staff_key as string;
    const existing = lateByStaff.get(key);
    if (existing) existing.count += 1;
    else lateByStaff.set(key, { staffKey: key, staffName: row.staff_name as string, count: 1 });
  }
  // Real threshold: 3+ late check-ins in the current month is a genuine
  // pattern, not a one-off.
  const lateCheckInsThisMonth = [...lateByStaff.values()].filter((s) => s.count >= 3);

  const leaveByStaff = new Map<string, StaffPatternAlert>();
  for (const row of leaveRes.data ?? []) {
    const key = row.agent_key as string;
    const days = (row.days_count as number) ?? 0;
    const existing = leaveByStaff.get(key);
    if (existing) existing.count += days;
    else leaveByStaff.set(key, { staffKey: key, staffName: row.agent_name as string, count: days });
  }
  // Real threshold: 10+ approved leave days in one calendar year.
  const highLeaveUsageThisYear = [...leaveByStaff.values()].filter((s) => s.count >= 10);

  return { lateCheckInsThisMonth, highLeaveUsageThisYear, opsOverdueCount: opsRes.count ?? 0 };
}

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
  // Phase 8 (C2.10) -- Site Visits is a real per-agent-owned table like
  // Complaints/Referrals above, so every profile fetches its own scope.
  const siteVisitsQuery = useQuery({
    queryKey: ['smartInsightsSiteVisits', isManager, agentKey],
    enabled: !!profile,
    queryFn: () => {
      const ds = getDataSource(demoMode);
      return isManager ? ds.siteVisits.listAll() : ds.siteVisits.listForAgent(agentKey);
    },
  });
  // Manager-only, same reasoning as Leave/Banners above (staff-wide
  // patterns and ops health are Management concerns).
  const extrasQuery = useQuery({
    queryKey: ['smartInsightsExtras', isManager],
    enabled: !!profile && isManager,
    queryFn: fetchIntelligenceExtras,
  });

  const crossApp: CrossAppData = useMemo(
    () => ({
      complaints: complaintsQuery.data,
      referrals: referralsQuery.data,
      allocationRequests: allocationsQuery.data,
      contractRequests: contractRequestsQuery.data,
      leaveRequests: leaveRequestsQuery.data,
      banners: bannersQuery.data,
      siteVisits: siteVisitsQuery.data,
    }),
    [complaintsQuery.data, referralsQuery.data, allocationsQuery.data, contractRequestsQuery.data, leaveRequestsQuery.data, bannersQuery.data, siteVisitsQuery.data],
  );

  const insights = useMemo(
    () => (leadsQuery.data && paymentsQuery.data ? computeSmartInsights(leadsQuery.data, paymentsQuery.data, crossApp, extrasQuery.data ?? {}) : []),
    [leadsQuery.data, paymentsQuery.data, crossApp, extrasQuery.data],
  );

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
