import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { isoPlusDays, today } from '../../../shared/lib/format';
import { daysBetween, type ReportRange } from '../../manager/lib/managementReportLogic';
import { computeStaffReportRows, computeDayOfWeekBuckets, streakHistoryWindowDays } from '../lib/staffReportLogic';

export function useCanViewStaffReport(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return profile?.role === 'manager';
}

export function useAgentRoster() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['staffReportAgents'],
    queryFn: async () => (await getDataSource(demoMode).staff.listAll()).filter((s) => s.role === 'agent' && s.active),
  });
}

// leaderboard_rows()'s p_from/p_to only actually scope deals_closed_year
// (verified live against staging via pg_get_functiondef) -- every other
// column this hook reads from it (tasks/todos/attendance) is hardcoded
// server-side to a trailing 90-day window regardless of what range is
// passed, so the exact range passed here doesn't change those results.
// Passed anyway for readability, not because it does anything.
function last90DaysRange(): ReportRange {
  return { from: isoPlusDays(today(), -90), to: today(), label: 'Last 90 days' };
}

export function useStaffReportData(range: ReportRange, staffKey: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: agents } = useAgentRoster();

  const dataQuery = useQuery({
    queryKey: ['staffReportData', demoMode],
    queryFn: async () => {
      const ds = getDataSource(demoMode);
      const l90 = last90DaysRange();
      const [leads, payments, siteVisits, leaderboardRows] = await Promise.all([ds.leads.listAll(), ds.payments.listAll(), ds.siteVisits.listAll(), ds.manager.leaderboardRows(l90.from, l90.to)]);
      return { leads, payments, siteVisits, leaderboardRows };
    },
  });

  const windowDays = streakHistoryWindowDays(range.from, range.to, daysBetween);
  const streakQuery = useQuery({
    queryKey: ['staffReportStreak', staffKey, windowDays, demoMode],
    enabled: !!staffKey,
    queryFn: () => getDataSource(demoMode).streaks.history(staffKey, windowDays),
  });

  const rows = dataQuery.data && agents ? computeStaffReportRows(dataQuery.data.leads, dataQuery.data.payments, dataQuery.data.siteVisits, dataQuery.data.leaderboardRows, range.from, range.to, agents) : [];

  const dayOfWeek = staffKey && streakQuery.data ? computeDayOfWeekBuckets(streakQuery.data.filter((s) => s.dayMet && s.date >= range.from && s.date <= range.to).map((s) => s.date)) : null;

  return {
    isLoading: dataQuery.isLoading || !agents || (!!staffKey && streakQuery.isLoading),
    rows,
    one: staffKey ? (rows.find((r) => r.key === staffKey) ?? null) : null,
    dayOfWeek,
  };
}
