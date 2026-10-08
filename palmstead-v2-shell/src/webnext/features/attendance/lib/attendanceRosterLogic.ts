import type { AttendanceNote, AttendanceRecord } from '../../../types/domain';
import { computeLateness } from './attendanceGeo';
import type { AttendancePolicy } from '../../../types/domain';

export interface SuggestedNote {
  staffKey: string;
  staffName: string;
  kind: 'praise' | 'warning';
  reason: string;
  workDate: string;
}

// Master Spec 11.3's real requirement: Management should never have to
// notice a pattern by eye and click a button per staff member -- the
// judgement (is this pattern worth a note) comes from real counted data.
// Management can still edit the drafted wording or dismiss the
// suggestion outright; this only decides WHETHER a pattern exists and
// drafts the wording, never auto-issues a note on its own.
const LOOKBACK_WORKDAYS = 10;
const LATE_THRESHOLD = 3;
const ABSENCE_THRESHOLD = 2;

export function detectAttendancePatterns(
  companyRecords: AttendanceRecord[],
  existingNotes: AttendanceNote[],
  policy: AttendancePolicy | null,
): SuggestedNote[] {
  const byStaff = new Map<string, AttendanceRecord[]>();
  for (const rec of companyRecords) {
    if (!byStaff.has(rec.staffKey)) byStaff.set(rec.staffKey, []);
    byStaff.get(rec.staffKey)!.push(rec);
  }

  const alreadyNoted = new Set(existingNotes.map((n) => `${n.staffKey}:${n.kind}:${n.workDate}`));
  const suggestions: SuggestedNote[] = [];

  for (const [staffKey, records] of byStaff) {
    const recent = [...records].sort((a, b) => b.workDate.localeCompare(a.workDate)).slice(0, LOOKBACK_WORKDAYS);
    if (!recent.length) continue;
    const staffName = recent[0].staffName ?? staffKey;

    const lateDays = recent.filter((r) => r.signInAt && computeLateness(new Date(r.signInAt), policy));
    const absentDays = recent.filter((r) => !r.signInAt);
    const mostRecentDate = recent[0].workDate;

    if (lateDays.length >= LATE_THRESHOLD) {
      const key = `${staffKey}:warning:${mostRecentDate}`;
      if (!alreadyNoted.has(key)) {
        suggestions.push({
          staffKey,
          staffName,
          kind: 'warning',
          workDate: mostRecentDate,
          reason: `Late sign-in ${lateDays.length} of the last ${recent.length} working days (most recently ${mostRecentDate}). Please discuss with ${staffName} and confirm they understand the expected start time.`,
        });
        continue;
      }
    }

    if (absentDays.length >= ABSENCE_THRESHOLD) {
      const key = `${staffKey}:warning:${mostRecentDate}`;
      if (!alreadyNoted.has(key)) {
        suggestions.push({
          staffKey,
          staffName,
          kind: 'warning',
          workDate: mostRecentDate,
          reason: `${absentDays.length} unexplained absences in the last ${recent.length} working days. Please follow up with ${staffName} directly.`,
        });
        continue;
      }
    }

    const onTimeStreak = recent.length >= LOOKBACK_WORKDAYS && lateDays.length === 0 && absentDays.length === 0;
    if (onTimeStreak) {
      const key = `${staffKey}:praise:${mostRecentDate}`;
      if (!alreadyNoted.has(key)) {
        suggestions.push({
          staffKey,
          staffName,
          kind: 'praise',
          workDate: mostRecentDate,
          reason: `${recent.length} consecutive working days on time with no absences. A great, consistent run worth recognizing.`,
        });
      }
    }
  }

  return suggestions;
}
