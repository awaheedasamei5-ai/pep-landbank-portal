import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useManagerOverview } from '@/lib/palmstead/use-manager-overview';
import { useExpenses } from '@/app/(main)/dashboard/finance/_components/use-finance-expenses';
import { today, monthLabel } from '../../../shared/lib/format';
import { computePipelineComposition, computePaymentsByMethod, computeTopAgentsByRevenue, computeNetPosition, monthRevenue } from '../lib/analyticsLogic';

// Unified Analytics -- port of index.html's mgrAnalytics() (index.html:
// 20339-20394), itself explicitly documented there as "purely
// additive": it reuses the same computePipelineComposition/
// computeManagementReportData math the PDF-only Management Report and
// Pipeline Health card already use, rather than introducing new logic.
// This hook does the same -- reuses the real, already-shipped
// useManagerOverview() (src/lib/palmstead/use-manager-overview.ts,
// backs the live Home dashboard) for outstanding/fullyPaidCount/the
// 6-month collected trend, and adds only what it doesn't cover:
// pipeline composition, payments-by-method, top-agents-by-revenue, and
// net position -- all for the current month.
//
// Net position (cash-basis: payments in minus approved expenses out) IS
// included here, unlike web-next's own useAnalytics.ts, which left it
// out because web-next had no live-wired Expenses feature to verify
// against at the time. This shell's real Accounting Expenses panel is
// already shipped and already verified live, so reusing its own
// useExpenses() hook closes that gap rather than re-deriving a second
// expenses query.
export function useAnalyticsOverview() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const overview = useManagerOverview();
  const { data: staff } = useStaffDirectory();
  const { data: expenses } = useExpenses();
  const nameFor = useMemo(() => new Map((staff ?? []).map((s) => [s.key, s.name])), [staff]);

  const leadsQuery = useQuery({ queryKey: ['analyticsLeads'], queryFn: () => getDataSource(demoMode).leads.listAll() });
  const paymentsQuery = useQuery({ queryKey: ['analyticsPayments'], queryFn: () => getDataSource(demoMode).payments.listAll() });

  const mk = today().slice(0, 7);

  const composition = useMemo(() => (leadsQuery.data ? computePipelineComposition(leadsQuery.data) : null), [leadsQuery.data]);
  const methodBreakdown = useMemo(() => (paymentsQuery.data ? computePaymentsByMethod(paymentsQuery.data, mk) : []), [paymentsQuery.data, mk]);
  const topAgents = useMemo(
    () => (leadsQuery.data && paymentsQuery.data ? computeTopAgentsByRevenue(leadsQuery.data, paymentsQuery.data, mk, (key) => nameFor.get(key) ?? key).slice(0, 5) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leadsQuery.data, paymentsQuery.data, mk, nameFor],
  );
  const revenueThisMonth = useMemo(() => (paymentsQuery.data ? monthRevenue(paymentsQuery.data, mk) : 0), [paymentsQuery.data, mk]);
  const netPosition = useMemo(() => (paymentsQuery.data && expenses ? computeNetPosition(paymentsQuery.data, expenses, mk) : null), [paymentsQuery.data, expenses, mk]);

  return {
    isLoading: overview.isLoading || leadsQuery.isLoading || paymentsQuery.isLoading,
    monthLabel: monthLabel(mk),
    revenueThisMonth,
    outstanding: overview.data?.outstanding ?? 0,
    fullyPaidCount: overview.data?.fullyPaidCount ?? 0,
    revenueTrend: overview.data?.collectedTrend ?? [],
    composition,
    methodBreakdown,
    topAgents,
    netPosition,
    // Passed straight through for the AI briefing's context -- same
    // real numbers the Home dashboard's manager KPIs already show, so
    // the briefing can never cite a figure this page doesn't also
    // display.
    totalLeads: overview.data?.totalLeads ?? 0,
    openComplaints: overview.data?.openComplaints ?? 0,
    pipelineValue: overview.data?.pipelineValue ?? 0,
    siteVisitsCount: overview.data?.siteVisitsCount ?? 0,
    stageFunnel: overview.data?.stageFunnel ?? [],
    byAgent: overview.data?.byAgent ?? [],
  };
}
