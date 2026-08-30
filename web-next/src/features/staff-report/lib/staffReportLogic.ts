import type { Lead, Payment, SiteVisit, LeaderboardRow } from '../../../types/domain';

// manager.leaderboardRows() returns the raw, unscored RPC rows -- no
// `points` (that's computed client-side from config.leaderboardWeights,
// see leaderboardLogic.ts's agentPoints()) -- which Staff Report never
// needs, so it accepts this looser shape rather than the full type.
type RawLeaderboardRow = Omit<LeaderboardRow, 'points'>;

// Port of index.html's computeStaffReportData() (index.html:23291-23314)
// -- "stitches together three data sources that don't otherwise share a
// screen: pipeline, operations, and attendance/streak." Two real,
// verified constraints on this port, both worth stating explicitly
// rather than silently approximating:
//
// 1. The Operations section (tasks assigned/completed/overdue/escalated,
//    per-lifecycle-phase timing) needs index.html's computeOpsReportData,
//    which itself needs task_events and full lifecycle timestamps
//    (created/opened/started/completed/escalated/blocked/awaiting-
//    approval) on the tasks table. web-next's ScheduleItem has none of
//    this -- it's a much slimmer { kind, ownerKey, assignedTo, date,
//    status, title } shape. Overdue/escalated are dropped entirely here,
//    undocumented-as-anything-else in the source rather than faked.
// 2. `tasksCompleted`/`avgTaskDays`/`daysAttended`/`onTimeDays` ARE real
//    and available (via the same leaderboard_rows() RPC Leaderboard
//    already calls) -- but verified live (pg_get_functiondef on
//    staging) that this RPC's p_from/p_to params only actually scope
//    deals_closed_year; every other column is hardcoded to a trailing
//    90-day window (tasks/todos/attendance) or an all-time sum
//    (total_collected/site_visits) regardless of what range is passed.
//    Leaderboard itself has always silently had this limitation for any
//    year other than "current" -- not something this session
//    introduced, but not something to silently compound either. Staff
//    Report is honest about it: those 4 fields are always labeled
//    "last 90 days" in the UI/PDF, never implied to respect the period
//    picker. Leads added/deals closed/revenue/site visits ARE genuinely
//    period-accurate here, computed directly from leads/payments/site
//    visits (the same approach Analytics/Management Reports use) rather
//    than trusted to the RPC.

function inRange(date: string | null | undefined, from: string, to: string): boolean {
  const d = (date ?? '').slice(0, 10);
  return !!d && d >= from && d <= to;
}

export interface StaffSalesRow {
  key: string;
  name: string;
  leadsAdded: number;
  dealsClosed: number;
  revenue: number;
  siteVisits: number;
  tasksCompleted: number;
  avgTaskDays: number | null;
  daysAttended: number;
  onTimeDays: number;
}

export function computeStaffReportRows(leads: Lead[], payments: Payment[], siteVisits: SiteVisit[], leaderboardRows: RawLeaderboardRow[], from: string, to: string, agents: { key: string; name: string }[]): StaffSalesRow[] {
  const approved = payments.filter((p) => (p.status ?? 'approved') === 'approved');
  return agents
    .map((a) => {
      const leadsA = leads.filter((l) => l.agent === a.key && inRange(l.date, from, to));
      const dealsClosed = leadsA.filter((l) => l.grandTotal > 0 && l.amtPaid >= l.grandTotal).length;
      const revenue = approved.filter((p) => p.agentKey === a.key && inRange(p.date, from, to)).reduce((s, p) => s + p.amount, 0);
      const visits = siteVisits.filter((v) => v.agentKey === a.key && inRange(v.visitDate, from, to)).length;
      const lb = leaderboardRows.find((r) => r.staffKey === a.key);
      return {
        key: a.key,
        name: a.name,
        leadsAdded: leadsA.length,
        dealsClosed,
        revenue,
        siteVisits: visits,
        tasksCompleted: lb?.tasksCompleted ?? 0,
        avgTaskDays: lb?.avgTaskDays ?? null,
        daysAttended: lb?.daysAttended ?? 0,
        onTimeDays: lb?.onTimeDays ?? 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// Trailing days-of-week bucket -- how many of this staff member's "day
// met" streak entries in the window fall on each weekday. Same capping
// as index.html's own Math.min(span+3,90) (streak history is itself
// only ever populated going back so far, and 90 days is plenty to see a
// real weekly pattern).
export function computeDayOfWeekBuckets(streakDates: string[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  streakDates.forEach((d) => {
    buckets[new Date(`${d}T00:00:00`).getDay()] += 1;
  });
  return buckets;
}

export function streakHistoryWindowDays(from: string, to: string, daysBetween: (a: string, b: string) => number): number {
  const span = Math.max(1, daysBetween(from, to) || 30);
  return Math.min(span + 3, 90);
}
