import { ghanaHolidayMapForYear, isWeekendIso } from '../../../shared/lib/ghanaHolidays';
import type { Config, EidWindow, LeaveRequest } from '../../../types/domain';

// Faithful port of index.html's leave-quota calendar engine -- V1's real
// business rules (Attendance/Leave plan Part 1), preserved exactly as
// pure logic, no UI/architecture carried over. 'planned' (a private
// draft), 'pending', and 'approved' all block a date; only
// declined/rescheduled free it back up.
export function leaveIsBlocking(status: LeaveRequest['status']): boolean {
  return status === 'planned' || status === 'pending' || status === 'approved';
}

// A planned-but-not-sent request starting within `withinDays` surfaces a
// nudge to actually send it before it's too late for Management to act.
export function leavePlannedDueSoon(requests: LeaveRequest[], agentKey: string, todayIso: string, withinDays = 7): LeaveRequest[] {
  const cutoff = new Date(`${todayIso}T00:00:00`);
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return requests.filter((r) => r.agentKey === agentKey && r.status === 'planned' && r.dates.some((d) => d >= todayIso && d <= cutoffIso));
}

// V1's real rule: leave must not read as "used" the moment it's approved
// -- only once the dates have passed AND the staff member actively
// confirms they took it (leaveIsConfirmedUsed below). This is
// deliberately still status-based (planned/pending/approved, same as
// leaveIsBlocking) -- it protects the annual entitlement cap, not a
// usage log: without reserving pending/approved-but-not-yet-taken days
// against the total, nothing stops someone stacking more requests than
// their entitlement before any of them are confirmed used. Named
// "Reserved" everywhere it's shown in the UI, never "Used".
export function leaveDaysReserved(requests: LeaveRequest[], agentKey: string, year: number): number {
  return requests.filter((r) => r.agentKey === agentKey && r.year === year && leaveIsBlocking(r.status)).reduce((s, r) => s + (r.daysCount || 0), 0);
}

export function leaveDaysRemaining(config: Config, requests: LeaveRequest[], agentKey: string, year: number): number {
  return Math.max(0, (config.leaveTotalDays || 20) - leaveDaysReserved(requests, agentKey, year));
}

// The real "used" concept: approved, every date already in the past, and
// the staff member has actively confirmed they took it.
export function leaveIsConfirmedUsed(r: LeaveRequest, todayIso: string): boolean {
  const lastDate = r.dates[r.dates.length - 1] ?? '';
  return r.status === 'approved' && !!r.usedConfirmedAt && lastDate < todayIso;
}

export function leaveDaysConfirmedUsed(requests: LeaveRequest[], agentKey: string, year: number, todayIso: string): number {
  return requests.filter((r) => r.agentKey === agentKey && r.year === year && leaveIsConfirmedUsed(r, todayIso)).reduce((s, r) => s + (r.daysCount || 0), 0);
}

// Approved, dates already passed, not yet confirmed -- surfaces the "did
// you take this leave?" prompt on the requester's own Leave screen.
export function leaveNeedingUsageConfirmation(requests: LeaveRequest[], agentKey: string, todayIso: string): LeaveRequest[] {
  return requests.filter((r) => r.agentKey === agentKey && r.status === 'approved' && !r.usedConfirmedAt && (r.dates[r.dates.length - 1] ?? '') < todayIso);
}

// Every OTHER staff member's pending/approved/planned leave date -- pure
// overlap only. V1's real rule is non-overlap, nothing about adjacent
// days: if one person returns Tuesday, another may start Wednesday.
export function leaveConflictDatesFromOthers(requests: LeaveRequest[], agentKey: string): Set<string> {
  const blocked = new Set<string>();
  requests
    .filter((r) => r.agentKey !== agentKey && leaveIsBlocking(r.status))
    .forEach((r) => (r.dates || []).forEach((d) => blocked.add(d)));
  return blocked;
}

// Management's company-wide "who's out soon" view -- genuinely new, no
// V1 precedent (Attendance/Leave plan Part 4's "who's actually around").
// Deliberately NOT leavePlannedDueSoon() above -- that one only ever
// surfaces a staff member's own still-private 'planned' draft to
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
// could land in between). Emergency leave is the deliberate exception to
// the colleague-overlap check (Plan Part 1) -- callers skip this check
// entirely for an emergency request, never call it and ignore the result.
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

// Real-time picker feedback (Plan Part 3: "picking dates immediately
// tells them how many real days that costs them ... shown as a plain
// sentence"). V1's own model is a set of discrete selected dates, not
// always a contiguous range (Plan Part 2's OpenHRApp-adaptation note) --
// this classifies whatever dates the staff member has actually clicked
// on the calendar, in any order, so the UI can show a running "N working
// day(s). M weekend(s) excluded. K public holiday(s) excluded." summary.
export interface LeaveDayBreakdown {
  workingDays: string[];
  weekendsExcluded: number;
  holidaysExcluded: { date: string; name: string }[];
}

export function classifyLeaveDates(dates: string[], eidWindows: EidWindow[], eidObservingStaff: string[], agentKey: string): LeaveDayBreakdown {
  const workingDays: string[] = [];
  let weekendsExcluded = 0;
  const holidaysExcluded: { date: string; name: string }[] = [];
  const observesEid = eidObservingStaff.includes(agentKey);
  const holidayMaps = new Map<number, Map<string, { date: string; name: string; isEid?: boolean }>>();

  for (const iso of [...dates].sort()) {
    const year = Number(iso.slice(0, 4));
    if (!holidayMaps.has(year)) holidayMaps.set(year, ghanaHolidayMapForYear(year, eidWindows));
    if (isWeekendIso(iso)) {
      weekendsExcluded++;
      continue;
    }
    const h = holidayMaps.get(year)!.get(iso);
    if (h && !(h.isEid && observesEid)) {
      holidaysExcluded.push({ date: iso, name: h.name });
      continue;
    }
    workingDays.push(iso);
  }

  return { workingDays, weekendsExcluded, holidaysExcluded };
}
