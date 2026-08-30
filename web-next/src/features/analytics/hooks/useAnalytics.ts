import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useManagerOverview } from '../../manager/hooks/useManagerOverview';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { today, monthLabel } from '../../../shared/lib/format';
import { computePipelineComposition, computePaymentsByMethod, computeTopAgentsByRevenue, monthRevenue } from '../lib/analyticsLogic';

// Unified Analytics -- port of index.html's mgrAnalytics(), which is
// itself explicitly documented there as "purely additive": it reuses the
// same computePipelineComposition/computeManagementReportData math the
// PDF-only Management Report and Pipeline Health card already use,
// rather than introducing new logic. This hook does the same -- reuses
// useManagerOverview() (already builds the 6-month revenue trend,
// outstanding, fully-paid-count) for the KPI strip, and adds only the
// three things it doesn't cover: pipeline composition, payments-by-
// method, and top-agents-by-revenue, all for the current month.
//
// Net position (cash-basis: payments in minus approved expenses out) is
// deliberately NOT ported -- it needs the live-only Expenses tables
// (Log Expense/Categories/Recurring) this session already scoped out of
// Fund Requests + Approvals for the same reason: no live-mode sign-in
// exists yet in web-next to verify a live-only feature through the
// app's own UI.
export function useAnalytics() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const overview = useManagerOverview();
  const { data: staff } = useStaffDirectory();
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
  };
}
