import type { AttendanceRecord, LeaveRequest, Profile } from '../../../types/domain';

// New 2026-09-10, user correction: "the attandance app doenst have a
// records page, analytics nothing and managemnt cant even pull filter or
// compare staff attendance trends or even pull a report on attendance."
// Same real rules as attendanceRosterLogic.ts's daily tally/pattern
// detector (workday-aware, approved leave never counts as absence),
// generalized over an arbitrary Management-picked date range instead of a
// fixed trailing window.
export interface StaffAttendanceSummary {
  staffKey: string;
  staffName: string;
  workDays: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  offSite: number;
  onTimeRate: number;
}

function prevDayIso(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function enumerateWorkdays(startDate: string, endDate: string, workDays: number[]): string[] {
  if (startDate > endDate) return [];
  const out: string[] = [];
  const d = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (d <= end) {
    if (workDays.includes(d.getDay())) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function computeStaffAttendanceSummaries(
  staff: Profile[],
  records: AttendanceRecord[],
  leaveRequests: LeaveRequest[],
  workDays: number[],
  cutoff: string,
  startDate: string,
  endDate: string,
  todayIso: string
): StaffAttendanceSummary[] {
  // Today isn't a finished data point -- an unfinished day is neither
  // present nor absent yet, so it's excluded from the counted window
  // rather than silently scored as an absence.
  const effectiveEnd = endDate >= todayIso ? prevDayIso(todayIso) : endDate;
  const window = enumerateWorkdays(startDate, effectiveEnd, workDays);

  return staff.map((s) => {
    const onLeaveDates = new Set(leaveRequests.filter((r) => r.agentKey === s.key && r.status === 'approved').flatMap((r) => r.dates));
    const own = records.filter((r) => r.staffKey === s.key);
    let present = 0;
    let late = 0;
    let offSite = 0;
    let onLeave = 0;
    for (const d of window) {
      const rec = own.find((r) => r.workDate === d);
      if (rec?.signInAt) {
        present++;
        if (rec.isOffSiteIn) offSite++;
        else if (rec.signInAt.slice(11, 16) > cutoff) late++;
      } else if (onLeaveDates.has(d)) {
        onLeave++;
      }
    }
    const absent = Math.max(0, window.length - present - onLeave);
    const onTimeRate = present > 0 ? Math.round(((present - late) / present) * 100) : 0;
    return { staffKey: s.key, staffName: s.name, workDays: window.length, present, late, absent, onLeave, offSite, onTimeRate };
  });
}

export interface AttendanceRecordRow extends AttendanceRecord {
  onTime: boolean;
}

export function attendanceRecordRows(records: AttendanceRecord[], cutoff: string): AttendanceRecordRow[] {
  return records
    .filter((r) => !!r.signInAt)
    .map((r) => ({ ...r, onTime: !r.isOffSiteIn && !!r.signInAt && r.signInAt.slice(11, 16) <= cutoff }))
    .sort((a, b) => (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0));
}

function mondayOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export interface TrendPoint {
  label: string;
  value: number;
}

// Company-wide average on-time rate, bucketed by week -- the "Teams
// Reports" style punctuality trend from the user's original reference
// images (2026-09-05 spec restatement), built for real once the Records
// screen's own date-range/company-wide data was already in place.
export function computePunctualityTrend(records: AttendanceRecord[], cutoff: string): TrendPoint[] {
  const byWeek = new Map<string, { present: number; late: number }>();
  for (const r of records) {
    if (!r.signInAt) continue;
    const week = mondayOfWeek(r.workDate);
    const bucket = byWeek.get(week) ?? { present: 0, late: 0 };
    bucket.present++;
    if (!r.isOffSiteIn && r.signInAt.slice(11, 16) > cutoff) bucket.late++;
    byWeek.set(week, bucket);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, b]) => ({
      label: new Date(week + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      value: b.present > 0 ? Math.round(((b.present - b.late) / b.present) * 100) : 0,
    }));
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface WeekdayHours {
  label: string;
  avgHours: number;
}

// Company-wide average hours on-site per weekday -- the "working-hours bar
// chart" half of the same reference-image request.
export function computeAvgHoursByWeekday(records: AttendanceRecord[], workDays: number[]): WeekdayHours[] {
  const totals = new Map<number, { hours: number; count: number }>();
  for (const r of records) {
    if (!r.signInAt || !r.signOutAt) continue;
    const dow = new Date(r.workDate + 'T00:00:00').getDay();
    const hours = (new Date(r.signOutAt).getTime() - new Date(r.signInAt).getTime()) / 3_600_000;
    if (hours <= 0 || hours > 16) continue;
    const bucket = totals.get(dow) ?? { hours: 0, count: 0 };
    bucket.hours += hours;
    bucket.count++;
    totals.set(dow, bucket);
  }
  return workDays
    .slice()
    .sort((a, b) => a - b)
    .map((dow) => {
      const b = totals.get(dow);
      return { label: WEEKDAY_LABELS[dow], avgHours: b && b.count > 0 ? Math.round((b.hours / b.count) * 10) / 10 : 0 };
    });
}
