import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { requireSupabase } from '@/lib/supabase.client';
import { today, shiftMonth, monthKey, monthLabel } from '../../../shared/lib/format';

interface MonthlyCount {
  date: string;
}

function countInMonth(rows: MonthlyCount[], mk: string): number {
  return rows.filter((r) => monthKey(r.date) === mk).length;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

// docs/plans/27-analytics-v2-cross-app-plan.md -- real cross-app Sales
// Activity tab: Quotation, Contract of Sale, Referrals, Complaints,
// Site Visits. `quotation_requests` has no data-source abstraction
// anywhere in this shell yet (confirmed this session -- a real table,
// never read back through ds.*), so this queries it directly via
// requireSupabase(), the same established pattern useManagerOverview/
// useExpenses already use for a table with no existing method.
export function useSalesActivityAnalytics() {
  const thisM = today().slice(0, 7);
  const lastM = shiftMonth(thisM, -1);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(thisM, i - 5));

  const quotationsQuery = useQuery({
    queryKey: ['analyticsQuotations'],
    queryFn: async () => {
      const sb = requireSupabase();
      const { data, error } = await sb.from('quotation_requests').select('created_at').order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []).map((r) => ({ date: (r.created_at as string).slice(0, 10) }));
    },
  });
  const contractsQuery = useQuery({
    queryKey: ['analyticsContractsGenerated'],
    queryFn: async () => {
      const list = await getDataSource(false).contractGenerations.list();
      return list.map((c) => ({ date: c.generatedAt.slice(0, 10) }));
    },
  });
  const referralsQuery = useQuery({
    queryKey: ['analyticsReferrals'],
    queryFn: async () => {
      const list = await getDataSource(false).referrals.listForAgent('', true);
      return list.map((r) => ({ date: r.createdAt.slice(0, 10) }));
    },
  });
  const complaintsQuery = useQuery({
    queryKey: ['analyticsComplaints'],
    queryFn: async () => {
      const list = await getDataSource(false).complaints.listAll();
      return list.map((c) => ({ date: c.createdAt.slice(0, 10) }));
    },
  });
  const siteVisitsQuery = useQuery({
    queryKey: ['analyticsSiteVisits'],
    queryFn: async () => {
      const list = await getDataSource(false).siteVisits.listAll();
      return list.map((v) => ({ date: v.visitDate }));
    },
  });

  const isLoading = quotationsQuery.isLoading || contractsQuery.isLoading || referralsQuery.isLoading || complaintsQuery.isLoading || siteVisitsQuery.isLoading;

  const metrics = useMemo(() => {
    const build = (rows: MonthlyCount[] | undefined) => {
      const safe = rows ?? [];
      const current = countInMonth(safe, thisM);
      const previous = countInMonth(safe, lastM);
      return { current, previous, deltaPct: pctDelta(current, previous), trend: months.map((mk) => countInMonth(safe, mk)) };
    };
    return {
      quotations: build(quotationsQuery.data),
      contracts: build(contractsQuery.data),
      referrals: build(referralsQuery.data),
      complaints: build(complaintsQuery.data),
      siteVisits: build(siteVisitsQuery.data),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationsQuery.data, contractsQuery.data, referralsQuery.data, complaintsQuery.data, siteVisitsQuery.data]);

  return { isLoading, metrics, monthLabels: months.map((mk) => monthLabel(mk)), thisMonthLabel: monthLabel(thisM) };
}
