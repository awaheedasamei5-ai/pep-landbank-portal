import { ghanaHolidayMapForYear, isWeekendIso } from '../../../shared/lib/ghanaHolidays';
import type { Config, LeaveRequest } from '../../../types/domain';

// Faithful port of index.html's leave-quota calendar engine (index.html:
// 23684-23697, 24040-24051) -- quota tracking. Fixed 2026-09-03 (master
// spec's Section 1, "Leave logic is wrong for the requested rule" --
// flagged critical): the colleague-conflict rule used to also block the
// working day immediately before/after a colleague's leave, so nobody
// could pick a day adjacent to theirs either. The real, requested rule is
// non-overlap only -- if one person returns Tuesday, another may start
// Wednesday. 'planned' (v1's real private-draft stage), emergency leave,
// and the decline/reschedule-with-reason flow were closed 2026-09-05 --
// see LeaveScreen.tsx/useLeaveRequests.ts. 'planned'/'pending'/'approved'
// all block (matches v1: only declined/rescheduled free a date back up).
export function leaveIsBlocking(status: LeaveRequest['status']): boolean {
  return status === 'planned' || status === 'pending' || status === 'approved';
}

// Port of v1's leavePlannedDueSoonList() (index.html:23705-23708) -- a
// planned-but-not-sent request starting within `withinDays` surfaces a
// nudge to actually send it before it's too late for Management to act.
export function leavePlannedDueSoon(requests: LeaveRequest[], agentKey: string, todayIso: string, withinDays = 7): LeaveRequest[] {
  const cutoff = new Date(`${todayIso}T00:00:00`);
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return requests.filter((r) => r.agentKey === agentKey && r.status === 'planned' && r.dates.some((d) => d >= todayIso && d <= cutoffIso));
}

// User correction 2026-09-05: leave must not read as "used" the moment
// it's approved -- only once the dates have passed AND the staff member
// actively confirms they took it (leaveDaysConfirmedUsed below). This
// function is deliberately still status-based (planned/pending/approved,
// same as leaveIsBlocking) -- it protects the annual entitlement cap, not
// a usage log: without reserving pending/approved-but-not-yet-taken days
// against the total, nothing would stop someone stacking more requests
// than their entitlement before any of them are confirmed used. Named
// "Reserved" everywhere it's shown in the UI, never "Used".
export function leaveDaysReserved(requests: LeaveRequest[], agentKey: string, year: number): number {
  return requests.filter((r) => r.agentKey === agentKey && r.year === year && leaveIsBlocking(r.status)).reduce((s, r) => s + (r.daysCount || 0), 0);
}

export function leaveDaysRemaining(config: Config, requests: LeaveRequest[], agentKey: string, year: number): number {
  return Math.max(0, (config.leaveTotalDays || 20) - leaveDaysReserved(requests, agentKey, year));
}

// The real "used" concept: approved, every date already in the past, and
// the staff member has actively confirmed they took it (LeaveScreen.tsx's
// usage-confirmation prompt, calls ds.leaveRequests.confirmUsed()).
export function leaveIsConfirmedUsed(r: LeaveRequest, todayIso: string): boolean {
  const lastDate = r.dates[r.dates.length - 1] ?? '';
  return r.status === 'approved' && !!r.usedConfirmedAt && lastDate < todayIso;
}

export function leaveDaysConfirmedUsed(requests: LeaveRequest[], agentKey: string, year: number, todayIso: string): number {
  return requests.filter((r) => r.agentKey === agentKey && r.year === year && leaveIsConfirmedUsed(r, todayIso)).reduce((s, r) => s + (r.daysCount || 0), 0);
}

// Approved, dates already passed, not yet confirmed -- surfaces the
// "did you take this leave?" prompt on the requester's own Leave screen.
export function leaveNeedingUsageConfirmation(requests: LeaveRequest[], agentKey: string, todayIso: string): LeaveRequest[] {
  return requests.filter((r) => r.agentKey === agentKey && r.status === 'approved' && !r.usedConfirmedAt && (r.dates[r.dates.length - 1] ?? '') < todayIso);
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

// Management Leave Dashboard (genuinely new, no v1 precedent -- user ask
// 2026-09-05: "a live dashboard ... alert for leaves that are getting
// near"). Deliberately NOT leavePlannedDueSoon() above -- that one only
// ever surfaces a staff member's own still-private 'planned' draft to
// themselves. This covers every staff member's real, Management-visible
// (pending/approved) leave company-wide.
export interface UpcomingLeaveEntry {
  request: LeaveRequest;
  startDate: string;
}

export function leaveUpcomingForAll(requests: LeaveRequest[], todayIso: string, withinDays = 7): UpcomingLeaveEntry[] {
  const cutoff = new Date(`${todayIso}T00:00:00`);
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return requests
    .filter((r) => (r.status === 'approved' || r.status === 'pending') && r.dates.some((d) => d >= todayIso && d <= cutoffIso))
    .map((r) => ({ request: r, startDate: [...r.dates].sort().find((d) => d >= todayIso) ?? (r.dates[0] ?? '') }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// Re-checked both when a selection is reviewed and again right before the
// insert, since time can pass between the two (a colleague's request
// could land in between).
export function leaveDatesConflictReason(config: Config, requests: LeaveRequest[], dates: string[], agentKey: string, year: number): string | null {
  const holidays = ghanaHolidayMapForYear(year, config.eidWindows);
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
