import { ghanaHolidayMapForYear, isWeekendIso } from '../../../shared/lib/ghanaHolidays';
import type { Config, LeaveRequest } from '../../../types/domain';

// Faithful port of index.html's leave-quota calendar engine (index.html:
// 23684-23697, 24040-24051) -- quota tracking. Fixed 2026-09-03 (master
// spec's Section 1, "Leave logic is wrong for the requested rule" --
// flagged critical): the colleague-conflict rule used to also block the
// working day immediately before/after a colleague's leave, so nobody
// could pick a day adjacent to theirs either. The real, requested rule is
// non-overlap only -- if one person returns Tuesday, another may start
// Wednesday. The 'planned' pre-request stage, emergency leave's
// deduct-quota opt-out, and the reschedule flow are deliberately out of
// scope -- every request here goes straight to 'pending' (see
// LeaveRequest's own domain.ts comment), so "blocking" here is simply
// pending-or-approved, not the real three-state list.
export function leaveIsBlocking(status: LeaveRequest['status']): boolean {
  return status === 'pending' || status === 'approved';
}

export function leaveDaysUsed(requests: LeaveRequest[], agentKey: string, year: number): number {
  return requests.filter((r) => r.agentKey === agentKey && r.year === year && leaveIsBlocking(r.status)).reduce((s, r) => s + (r.daysCount || 0), 0);
}

export function leaveDaysRemaining(config: Config, requests: LeaveRequest[], agentKey: string, year: number): number {
  return Math.max(0, (config.leaveTotalDays || 20) - leaveDaysUsed(requests, agentKey, year));
}

// Every OTHER staff member's pending/approved leave date -- pure overlap
// only (see this file's header comment for why the old adjacent-day
// blocking was removed).
export function leaveConflictDatesFromOthers(requests: LeaveRequest[], agentKey: string): Set<string> {
  const blocked = new Set<string>();
  requests
    .filter((r) => r.agentKey !== agentKey && leaveIsBlocking(r.status))
    .forEach((r) => (r.dates || []).forEach((d) => blocked.add(d)));
  return blocked;
}

// Re-checked both when a selection is reviewed and again right before the
// insert, since time can pass between the two (a colleague's request
// could land in between).
export function leaveDatesConflictReason(config: Config, requests: LeaveRequest[], dates: string[], agentKey: string, year: number): string | null {
  const holidays = ghanaHolidayMapForYear(year);
  const observesEid = (config.eidObservingStaff || []).includes(agentKey);
  const otherConflicts = leaveConflictDatesFromOthers(requests, agentKey);
  for (const d of dates) {
    if (isWeekendIso(d)) return `${d} is a weekend — leave can only be taken Monday to Friday.`;
    const h = holidays.get(d);
    if (h && !(h.isEid && observesEid)) return `${d} is a public holiday (${h.name}).`;
    if (otherConflicts.has(d)) return `${d} conflicts with a colleague's leave.`;
  }
  return null;
}
