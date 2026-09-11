import type { AttendanceNote, AttendanceRecord, LeaveRequest, Profile } from '../../../types/domain';

// Master Spec 11.3's "Today roster: Present, Late, Absent, On Leave,
// Off-site, Not yet signed in" -- confirmed via exhaustive grep that
// index.html's teamAttendanceTodayHtml() (line ~4990) never built this
// aggregate at all, only a flat per-staff tag list (On time/Late/On
// leave/Absent, with off-site folded in as a sub-tag). Off-site is
// promoted to its own top-level category here because the spec names it
// as one explicitly; a signed-in-but-off-site staff member is bucketed
// under 'offsite' even if they were also late, since "where are they"
// is the more operationally urgent fact once someone has shown up at all.
export type RosterCategory = 'present' | 'late' | 'offsite' | 'onLeave' | 'absent' | 'notYetSignedIn';

export const ROSTER_CATEGORIES: { key: RosterCategory; label: string }[] = [
  { key: 'present', label: 'Present' },
  { key: 'late', label: 'Late' },
  { key: 'absent', label: 'Absent' },
  { key: 'onLeave', label: 'On Leave' },
  { key: 'offsite', label: 'Off-site' },
  { key: 'notYetSignedIn', label: 'Not yet signed in' },
];

export interface RosterEntry {
  staffKey: string;
  staffName: string;
  category: RosterCategory;
  detail: string;
  record: AttendanceRecord | null;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Real bug caught live 2026-09-05: this tally never checked
// Config.workDays at all, so a non-workday (Saturday, by default config --
// workDays defaults to Mon-Fri) rendered every single staff member as
// Absent/Not-yet-signed-in, since nobody is ever expected to sign in on a
// day off. Callers must check this before computing/rendering the tally at
// all -- a day off has no meaningful Present/Late/Absent split.
export function isConfiguredWorkday(workDate: string, workDays: number[]): boolean {
  return workDays.includes(new Date(workDate + 'T00:00:00').getDay());
}

// nowHHMM is passed in (rather than computed here from `new Date()`) so
// this stays a pure, easily-reasoned-about function -- same 24h
// 'en-GB'-formatted shape AttendanceScreen's own nowHHMM() already
// produces, and directly comparable to Config.attendanceCutoffTime.
// Splitting "not yet signed in" from "absent" by the cutoff time is new
// relative to v1, which only ever had one bucket (Absent) regardless of
// time of day -- see PHASE0_INVENTORY.md's entry for this feature for the
// reasoning and the open question this leaves for the user to weigh in on.
// Deliberately NOT leaveIsBlocking() (which also treats a 'planned' draft
// as blocking, e.g. for date-conflict checks) -- 'planned' is a private
// pre-submission stage explicitly not yet visible to Management (see
// useLeaveRequests.ts's notifyManagementOfLeaveRequest comment), so
// surfacing it here would leak a staff member's still-private leave
// planning onto the Management dashboard. Only a request Management can
// actually already see -- 'pending' (submitted, awaiting decision) or
// 'approved' -- may move someone out of Absent/Not-yet-signed-in.
function isVisibleLeaveForToday(r: LeaveRequest, staffKey: string, workDate: string): boolean {
  return r.agentKey === staffKey && (r.status === 'approved' || r.status === 'pending') && r.dates.includes(workDate);
}

export function computeAttendanceRoster(staff: Profile[], recordsToday: AttendanceRecord[], leaveRequests: LeaveRequest[], cutoff: string, workDate: string, nowHHMM: string): RosterEntry[] {
  return staff.map((s) => {
    const record = recordsToday.find((r) => r.staffKey === s.key) ?? null;
    const leave = leaveRequests.find((r) => isVisibleLeaveForToday(r, s.key, workDate));

    if (record?.signInAt) {
      if (record.isOffSiteIn) {
        return {
          staffKey: s.key,
          staffName: s.name,
          category: 'offsite' as const,
          detail: `In ${fmtTime(record.signInAt)}${record.signInReason ? ` · ${record.signInReason}` : ''}`,
          record,
        };
      }
      const late = record.signInAt.slice(11, 16) > cutoff;
      return {
        staffKey: s.key,
        staffName: s.name,
        category: late ? ('late' as const) : ('present' as const),
        detail: `In ${fmtTime(record.signInAt)}${record.signOutAt ? ` · Out ${fmtTime(record.signOutAt)}` : ''}${late && record.lateReason ? ` · ${record.lateReason}` : ''}`,
        record,
      };
    }

    if (leave) {
      return {
        staffKey: s.key,
        staffName: s.name,
        category: 'onLeave' as const,
        detail: leave.status === 'approved' ? 'On leave -- not expected in today' : 'Leave pending approval',
        record,
      };
    }

    if (nowHHMM <= cutoff) {
      return { staffKey: s.key, staffName: s.name, category: 'notYetSignedIn' as const, detail: `Expected by ${cutoff}`, record };
    }
    return { staffKey: s.key, staffName: s.name, category: 'absent' as const, detail: 'Not signed in', record };
  });
}

export function tallyRoster(entries: RosterEntry[]): Record<RosterCategory, number> {
  const tally: Record<RosterCategory, number> = { present: 0, late: 0, offsite: 0, onLeave: 0, absent: 0, notYetSignedIn: 0 };
  for (const e of entries) tally[e.category]++;
  return tally;
}

// ATTENDANCE_BLUEPRINT.md §4 -- ported from v1's attendanceMonthStatsFor.
// "On track" = on-time rate >=90% AND absences <=1 for the month so far;
// anything else is "at risk". Absences only count COMPLETE days (today
// itself is excluded, same "not a finished data point yet" reasoning as
// trailingWorkdayIsos() above) so someone who simply hasn't signed in yet
// today, still inside their grace period, is never wrongly counted absent.
export interface MonthStats {
  daysAttended: number;
  onTimeDays: number;
  onTimeRate: number;
  absences: number;
  onLeave: number;
  isOnTrack: boolean;
}

export function computeMonthStats(history: AttendanceRecord[], leaveRequests: LeaveRequest[], staffKey: string, workDays: number[], cutoff: string, monthKey: string, todayIso: string): MonthStats {
  const monthHistory = history.filter((h) => h.staffKey === staffKey && h.workDate.slice(0, 7) === monthKey);
  const daysAttended = monthHistory.filter((h) => h.signInAt).length;
  const onTimeDays = monthHistory.filter((h) => h.signInAt && h.signInAt.slice(11, 16) <= cutoff).length;
  const onTimeRate = daysAttended > 0 ? onTimeDays / daysAttended : 1;

  const onLeaveDates = new Set(leaveRequests.filter((r) => r.agentKey === staffKey && r.status === 'approved').flatMap((r) => r.dates.filter((d) => d.slice(0, 7) === monthKey)));

  const [y, m] = monthKey.split('-').map(Number);
  const lastCompleteDay = todayIso.slice(0, 7) === monthKey ? Number(todayIso.slice(8, 10)) - 1 : new Date(y, m, 0).getDate();
  let workdaysElapsed = 0;
  for (let d = 1; d <= lastCompleteDay; d++) {
    if (workDays.includes(new Date(y, m - 1, d).getDay())) workdaysElapsed++;
  }
  const attendedOrLeaveDates = new Set([...monthHistory.filter((h) => h.signInAt).map((h) => h.workDate), ...onLeaveDates]);
  const absences = Math.max(0, workdaysElapsed - attendedOrLeaveDates.size);

  return { daysAttended, onTimeDays, onTimeRate, absences, onLeave: onLeaveDates.size, isOnTrack: onTimeRate >= 0.9 && absences <= 1 };
}

// ATTENDANCE_BLUEPRINT.md §5 -- one cell per calendar day of the given
// month, GitHub-contributions style. A 'pending' leave request counts as
// onLeave here (unlike computeAttendanceRoster's Management-facing
// isVisibleLeaveForToday, which also allows 'pending') for the same
// reason: this is the staff member's OWN calendar of their OWN leave, not
// a company-wide roster, so there's no privacy leak in showing their own
// still-pending request.
export type CalendarDayStatus = 'present' | 'late' | 'absent' | 'onLeave' | 'notWorkday' | 'future';

export interface CalendarDay {
  date: string;
  dayNum: number;
  status: CalendarDayStatus;
  record: AttendanceRecord | null;
}

export function buildCalendarMonth(monthKey: string, history: AttendanceRecord[], leaveRequests: LeaveRequest[], staffKey: string, workDays: number[], cutoff: string, todayIso: string): CalendarDay[] {
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const own = history.filter((h) => h.staffKey === staffKey && h.workDate.slice(0, 7) === monthKey);
  const leaveDates = new Set(leaveRequests.filter((r) => r.agentKey === staffKey && (r.status === 'approved' || r.status === 'pending')).flatMap((r) => r.dates));

  const out: CalendarDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${monthKey}-${String(d).padStart(2, '0')}`;
    const record = own.find((h) => h.workDate === date) ?? null;
    let status: CalendarDayStatus;
    if (date > todayIso) status = 'future';
    else if (record?.signInAt) status = record.signInAt.slice(11, 16) > cutoff ? 'late' : 'present';
    else if (leaveDates.has(date)) status = 'onLeave';
    else if (!isConfiguredWorkday(date, workDays)) status = 'notWorkday';
    else status = 'absent';
    out.push({ date, dayNum: d, status, record });
  }
  return out;
}

// User correction 2026-09-07, verbatim: "management doesnt have the time
// to be clicking buttons to be warning or praizing staffs for their
// attendance... create an ai powered intelligent system that can do all
// this using its intelligence in real time." The VERDICT here is
// deliberately deterministic, auditable TypeScript, not an LLM call --
// an LLM deciding real HR outcomes from numbers it might misread is a
// worse failure mode than a manual button. The AI's actual job is only to
// WRITE the reason sentence for a pattern already decided here (see
// ai-insights' `attendance_pattern_reason` kind, useAttendancePatternReason
// hook) -- same "AI drafts text for a decision already made by real data"
// shape as every other kind in that function.
export interface AttendancePatternSuggestion {
  staffKey: string;
  staffName: string;
  kind: 'praise' | 'warning';
  lateCount: number;
  absentCount: number;
  presentCount: number;
  windowDays: number;
}

const PATTERN_WINDOW_WORKDAYS = 10;
const WARNING_LATE_THRESHOLD = 3;
const WARNING_ABSENT_THRESHOLD = 2;
const PRAISE_MIN_WORKDAYS = 5;

// The last `n` COMPLETE (strictly before today) configured work days,
// oldest first -- "complete" matters because today's own attendance isn't
// a finished data point yet (someone due by the cutoff later today isn't
// late or absent yet).
function trailingWorkdayIsos(todayIso: string, workDays: number[], n: number): string[] {
  const out: string[] = [];
  const d = new Date(todayIso + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  while (out.length < n) {
    if (workDays.includes(d.getDay())) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out.reverse();
}

export function detectAttendancePatterns(staff: Profile[], history: AttendanceRecord[], leaveRequests: LeaveRequest[], existingNotes: AttendanceNote[], workDays: number[], cutoff: string, todayIso: string): AttendancePatternSuggestion[] {
  const window = trailingWorkdayIsos(todayIso, workDays, PATTERN_WINDOW_WORKDAYS);
  const windowStart = window[0] ?? todayIso;
  const suggestions: AttendancePatternSuggestion[] = [];

  for (const s of staff) {
    // Don't re-suggest a pattern Management has already acted on for a
    // date inside this same window -- real dedupe, not just a UI hide.
    if (existingNotes.some((n) => n.staffKey === s.key && n.workDate >= windowStart)) continue;

    // Approved leave inside the window is never absence -- same real bug
    // class as computeAttendanceRoster's own leave check above; a staff
    // member on approved leave for 2+ of these days must never trigger a
    // false "absence pattern" warning.
    const onLeaveDates = new Set(leaveRequests.filter((r) => r.agentKey === s.key && r.status === 'approved').flatMap((r) => r.dates));
    const countableDays = window.filter((d) => !onLeaveDates.has(d));
    const own = history.filter((h) => h.staffKey === s.key && countableDays.includes(h.workDate));
    const lateCount = own.filter((h) => h.signInAt && h.signInAt.slice(11, 16) > cutoff).length;
    const presentCount = own.filter((h) => h.signInAt).length;
    const absentCount = countableDays.length - presentCount;

    if (lateCount >= WARNING_LATE_THRESHOLD || absentCount >= WARNING_ABSENT_THRESHOLD) {
      suggestions.push({ staffKey: s.key, staffName: s.name, kind: 'warning', lateCount, absentCount, presentCount, windowDays: countableDays.length });
    } else if (presentCount >= PRAISE_MIN_WORKDAYS && lateCount === 0 && absentCount === 0) {
      suggestions.push({ staffKey: s.key, staffName: s.name, kind: 'praise', lateCount, absentCount, presentCount, windowDays: countableDays.length });
    }
  }
  return suggestions;
}

// V3 chapter-01's 4th named AI capability: "detect repeated patterns such
// as ... suspiciously identical coordinates." Deterministic detection,
// same split as the pattern suggestions above -- real GPS readings drift
// by several meters between visits even standing in the exact same spot
// (atmospheric/multipath noise), so the SAME raw lat/lng reappearing
// across several different calendar days is itself the anomaly, not a
// judgement about where that point is. This can never fire from a single
// day, and never claims to know the cause (spoofing, a shared device, a
// copy-pasted coordinate) -- it only surfaces the real fact that
// Management should look at, exactly like the pattern suggestions above.
export interface SuspiciousCoordinateSuggestion {
  staffKey: string;
  staffName: string;
  lat: number;
  lng: number;
  matchedDates: string[];
}

const COORDINATE_MATCH_WINDOW_DAYS = 14;
const COORDINATE_MATCH_MIN_DATES = 3;

export function detectSuspiciousCoordinates(staff: Profile[], history: AttendanceRecord[], todayIso: string): SuspiciousCoordinateSuggestion[] {
  const windowStart = new Date(todayIso + 'T00:00:00');
  windowStart.setDate(windowStart.getDate() - COORDINATE_MATCH_WINDOW_DAYS);
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const suggestions: SuspiciousCoordinateSuggestion[] = [];
  for (const s of staff) {
    const own = history.filter((h) => h.staffKey === s.key && h.workDate >= windowStartIso && h.workDate < todayIso && h.signInLat != null && h.signInLng != null);
    const byCoord = new Map<string, { lat: number; lng: number; dates: Set<string> }>();
    for (const h of own) {
      const key = `${h.signInLat},${h.signInLng}`;
      const entry = byCoord.get(key) ?? { lat: h.signInLat as number, lng: h.signInLng as number, dates: new Set<string>() };
      entry.dates.add(h.workDate);
      byCoord.set(key, entry);
    }
    for (const { lat, lng, dates } of byCoord.values()) {
      if (dates.size >= COORDINATE_MATCH_MIN_DATES) {
        suggestions.push({ staffKey: s.key, staffName: s.name, lat, lng, matchedDates: [...dates].sort() });
      }
    }
  }
  return suggestions;
}
