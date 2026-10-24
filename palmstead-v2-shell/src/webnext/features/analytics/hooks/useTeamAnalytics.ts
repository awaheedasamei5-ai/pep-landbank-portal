import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase.client';
import { getDataSource } from '../../../data/source';
import { today, shiftMonth, monthKey } from '../../../shared/lib/format';

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

// docs/plans/27-analytics-v2-cross-app-plan.md -- real cross-app Team
// tab: Attendance + Leave. attendance_log has no existing company-wide
// listAll() data-source method (every other caller is per-staff
// scoped), so this queries it directly via requireSupabase(), same
// established pattern as useManagerOverview.
export function useTeamAnalytics() {
  const thisM = today().slice(0, 7);
  const lastM = shiftMonth(thisM, -1);
  const lastMonthStart = `${lastM}-01`;
  const nextMonthStart = `${shiftMonth(thisM, 1)}-01`;

  const attendanceQuery = useQuery({
    queryKey: ['analyticsAttendance', thisM],
    queryFn: async () => {
      const sb = requireSupabase();
      const { data, error } = await sb.from('attendance_log').select('work_date,sign_in_at').gte('work_date', lastMonthStart).lt('work_date', nextMonthStart);
      if (error) throw error;
      return (data ?? []) as { work_date: string; sign_in_at: string | null }[];
    },
  });

  const leaveQuery = useQuery({
    queryKey: ['analyticsLeave'],
    queryFn: () => getDataSource(false).leaveRequests.list(),
  });

  const isLoading = attendanceQuery.isLoading || leaveQuery.isLoading;

  const metrics = useMemo(() => {
    const att = attendanceQuery.data ?? [];
    const thisMonthAtt = att.filter((a) => a.work_date.slice(0, 7) === thisM);
    const lastMonthAtt = att.filter((a) => a.work_date.slice(0, 7) === lastM);
    const daysAttended = { current: thisMonthAtt.filter((a) => a.sign_in_at).length, previous: lastMonthAtt.filter((a) => a.sign_in_at).length };
    const onTimePct = (rows: typeof att) => {
      const signedIn = rows.filter((a) => a.sign_in_at);
      if (!signedIn.length) return 0;
      const onTime = signedIn.filter((a) => new Date(a.sign_in_at as string).getUTCHours() < 9).length;
      return Math.round((onTime / signedIn.length) * 100);
    };
    const onTime = { current: onTimePct(thisMonthAtt), previous: onTimePct(lastMonthAtt) };

    // Daily sign-in trend for the current month (one point per day that
    // has at least one real sign-in logged).
    const dailyMap = new Map<string, number>();
    thisMonthAtt.forEach((a) => {
      if (a.sign_in_at) dailyMap.set(a.work_date, (dailyMap.get(a.work_date) ?? 0) + 1);
    });
    const dailyTrend = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b));

    const leave = leaveQuery.data ?? [];
    const leaveThisMonth = leave.filter((r) => monthKey(r.createdAt) === thisM);
    const leaveLastMonth = leave.filter((r) => monthKey(r.createdAt) === lastM);
    const leaveDaysThisMonth = leaveThisMonth.reduce((s, r) => s + r.daysCount, 0);
    const leaveDaysLastMonth = leaveLastMonth.reduce((s, r) => s + r.daysCount, 0);

    return {
      daysAttended: { ...daysAttended, deltaPct: pctDelta(daysAttended.current, daysAttended.previous) },
      onTimePct: { ...onTime, deltaPct: pctDelta(onTime.current, onTime.previous) },
      leaveRequests: { current: leaveThisMonth.length, previous: leaveLastMonth.length, deltaPct: pctDelta(leaveThisMonth.length, leaveLastMonth.length) },
      leaveDays: { current: leaveDaysThisMonth, previous: leaveDaysLastMonth, deltaPct: pctDelta(leaveDaysThisMonth, leaveDaysLastMonth) },
      dailyTrend,
    };
  }, [attendanceQuery.data, leaveQuery.data, thisM, lastM]);

  return { isLoading, metrics };
}
