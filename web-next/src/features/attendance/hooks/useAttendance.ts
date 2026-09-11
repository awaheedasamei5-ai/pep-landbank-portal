import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { getSupabaseClient } from '../../../data/client';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { AttendanceNote, SignInInput, SignOutInput } from '../../../types/domain';
import type { AttendancePatternSuggestion, SuspiciousCoordinateSuggestion } from '../lib/attendanceRosterLogic';

export function useTodayAttendance() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const staffKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['attendanceToday', staffKey],
    enabled: !!staffKey,
    queryFn: () => getDataSource(demoMode).attendance.today(staffKey),
  });
}

// Real user ask (2026-09-05): "all attendance needs to go to management
// in real time with all the data" -- Management had no query onto anyone
// else's attendance at all before this.
export function useAllAttendanceToday() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');
  return useQuery({
    queryKey: ['attendanceAllToday'],
    enabled: isManager,
    queryFn: () => getDataSource(demoMode).attendance.listToday(),
  });
}

// Company-wide trailing window (unlike history() above, which is one
// staff member's own) -- backs the AI attendance-pattern suggestions.
export function useAllAttendanceRange(days: number) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');
  return useQuery({
    queryKey: ['attendanceRangeAll', days],
    enabled: isManager,
    queryFn: () => getDataSource(demoMode).attendance.listRange(days),
  });
}

// Explicit date-range window for the Attendance Records screen's own
// filter -- distinct from useAllAttendanceRange (a rolling "last N days
// from right now" used only by the AI pattern detector).
export function useAttendanceBetween(startDate: string, endDate: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');
  return useQuery({
    queryKey: ['attendanceBetween', startDate, endDate],
    enabled: isManager && !!startDate && !!endDate,
    queryFn: () => getDataSource(demoMode).attendance.listBetween(startDate, endDate),
  });
}

// User correction 2026-09-07, verbatim: "management doesnt have the time
// to be clicking buttons to be warning or praizing staffs for their
// attendance... create an ai powered intelligent system that can do all
// this using its intelligence in real time." AI drafts ONLY the reason
// sentence for a pattern `detectAttendancePatterns()` already decided
// deterministically -- same "AI drafts, Accept/Edit/Dismiss confirms"
// shape the V3 spec's own AI capability contract independently mandates
// (see palmstead-v3-master-rebuild-pdf memory). Cached per exact
// suggestion identity (staffKey/kind/counts) so re-renders don't refire
// the Groq call, and it never depends on demoMode -- there is no "demo AI",
// the edge function itself is the only implementation.
export function useAttendancePatternReason(suggestion: AttendancePatternSuggestion) {
  return useQuery({
    queryKey: ['attendancePatternReason', suggestion.staffKey, suggestion.kind, suggestion.lateCount, suggestion.absentCount, suggestion.presentCount],
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'attendance_pattern_reason',
          context: { staffName: suggestion.staffName, kind: suggestion.kind, lateCount: suggestion.lateCount, absentCount: suggestion.absentCount, presentCount: suggestion.presentCount, windowDays: suggestion.windowDays },
        },
      });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? null;
    },
    staleTime: Infinity,
  });
}

// V3 chapter-01's "detect suspiciously identical coordinates" AI
// capability -- see detectSuspiciousCoordinates() in
// attendanceRosterLogic.ts for the deterministic detection this only
// drafts language for.
export function useCoordinateFlagReason(suggestion: SuspiciousCoordinateSuggestion) {
  return useQuery({
    queryKey: ['attendanceCoordinateFlag', suggestion.staffKey, suggestion.lat, suggestion.lng, suggestion.matchedDates.length],
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: { kind: 'attendance_coordinate_flag', context: { staffName: suggestion.staffName, matchedDayCount: suggestion.matchedDates.length } },
      });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? null;
    },
    staleTime: Infinity,
  });
}

// V3 chapter-01's "explain attendance anomalies in plain English" AI
// capability -- summarizes a single already-flagged day for Management,
// on demand (enabled only once requested, never auto-fetched per row in
// a list) rather than deciding anything itself.
export function useAttendanceAnomalyExplainer(
  input: { staffName: string; workDate: string; isLate: boolean; lateMinutes: number | null; lateReason: string | null; isOffSite: boolean; offSiteReason: string | null; signInAt: string | null; signOutAt: string | null } | null,
) {
  return useQuery({
    queryKey: ['attendanceAnomalyExplainer', input?.staffName, input?.workDate],
    enabled: !!input,
    staleTime: Infinity,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !input) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: {
          kind: 'attendance_anomaly_explainer',
          context: {
            staffName: input.staffName,
            workDate: input.workDate,
            isLate: input.isLate,
            lateMinutes: input.lateMinutes,
            lateReason: input.lateReason,
            isOffSite: input.isOffSite,
            offSiteReason: input.offSiteReason,
            signInAt: input.signInAt ? new Date(input.signInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
            signOutAt: input.signOutAt ? new Date(input.signOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
          },
        },
      });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? null;
    },
  });
}

export function useAttendanceHistory(days = 14) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const staffKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['attendanceHistory', staffKey, days],
    enabled: !!staffKey,
    queryFn: () => getDataSource(demoMode).attendance.history(staffKey, days),
  });
}

export function useSignIn() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const staffKey = profile?.key ?? '';
  const staffName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SignInInput) => getDataSource(demoMode).attendance.signIn(staffKey, staffName, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceToday', staffKey] });
      queryClient.invalidateQueries({ queryKey: ['attendanceHistory', staffKey] });
    },
  });
}

export function useSignOut() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const staffKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SignOutInput }) => getDataSource(demoMode).attendance.signOut(staffKey, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceToday', staffKey] });
      queryClient.invalidateQueries({ queryKey: ['attendanceHistory', staffKey] });
    },
  });
}

// ATTENDANCE_BLUEPRINT.md §6 "You vs the team" -- a real aggregate-only
// RPC (get_attendance_month_comparison), not a raw table read, since a
// regular staff session can't read anyone else's attendance_log rows
// under real RLS. See source.ts's monthComparison() comment for why.
export function useAttendanceMonthComparison(monthKey: string, cutoff: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['attendanceMonthComparison', monthKey, cutoff, demoMode],
    queryFn: () => getDataSource(demoMode).attendance.monthComparison(monthKey, cutoff),
  });
}

// ATTENDANCE_BLUEPRINT.md §13 -- post-hoc off-site classification, distinct
// from attendanceExceptions (pre-authorization). list() is used both to
// check "does this record already have a review" (detail modal) and to
// build the "awaiting review" dashboard subsection.
export function useAttendanceReviews() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['attendanceReviews'], queryFn: () => getDataSource(demoMode).attendanceReviews.list() });
}

export function useDecideAttendanceReview() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attendanceLogId, staffKey, staffName, classification, note }: { attendanceLogId: string; staffKey: string; staffName: string; classification: 'authorized' | 'exception'; note: string }) =>
      getDataSource(demoMode).attendanceReviews.decide(attendanceLogId, staffKey, staffName, classification, note, profile?.key ?? '', profile?.name ?? 'Management'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendanceReviews'] }),
  });
}

// ATTENDANCE_BLUEPRINT.md §9 -- company-wide reset, gated in the UI behind
// two sequential confirm() dialogs (v1's exact pattern for this specific
// destructive action). Invalidates every attendance query surface since
// literally everyone's data just changed.
export function useResetAllAttendance() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getDataSource(demoMode).attendance.resetAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceToday'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceAllToday'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceRangeAll'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceBetween'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceMonthComparison'] });
    },
  });
}

// ATTENDANCE_BLUEPRINT.md §8 -- Management's record correction/delete from
// the per-record detail modal. Invalidates every query surface a changed
// record could appear on (own history/today, the roster's today/range
// queries, and any records-screen date-range window already cached) since
// a manager could be correcting a record days back, not just today's.
export function useUpdateAttendance() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { signInAt?: string | null; signOutAt?: string | null } }) => getDataSource(demoMode).attendance.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceToday'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceAllToday'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceRangeAll'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceBetween'] });
    },
  });
}

export function useDeleteAttendance() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).attendance.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendanceToday'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceHistory'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceAllToday'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceRangeAll'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceBetween'] });
    },
  });
}

// Master Spec 11.3: "Praise / Warning action with reason and audit trail."
// Own-or-manager SELECT RLS means a regular staff member calling this sees
// only their own notes -- used both for the Management dashboard's roster
// (manager, sees everyone) and a future staff-facing view of their own
// record, without needing two separate queries.
export function useAttendanceNotes() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['attendanceNotes'],
    queryFn: () => getDataSource(demoMode).attendanceNotes.list(),
  });
}

// Notify+SMS-on-write follows the exact pattern useDecideLeaveRequest
// already established: a real table write, an audit_events entry via
// ds.audit.log (never blocking the calling flow), an in-app notify(), and
// an SMS to the affected staff member's real phone if one exists.
export function useIssueAttendanceNote() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ staffKey, staffName, kind, reason, workDate }: { staffKey: string; staffName: string; kind: AttendanceNote['kind']; reason: string; workDate: string }) => {
      const ds = getDataSource(demoMode);
      const managerKey = profile?.key ?? '';
      const managerName = profile?.name ?? 'Management';
      const note = await ds.attendanceNotes.issue(staffKey, staffName, kind, reason, workDate, managerKey, managerName);
      ds.audit
        .log(`attendance.${kind}`, kind === 'warning' ? 'warning' : 'info', `${managerName} issued a ${kind} to ${staffName} for ${workDate}: ${reason}`, { staffKey, workDate }, 'attendance_note', note.id)
        .catch(() => {});
      const body =
        kind === 'praise'
          ? `${managerName} sent you praise regarding your attendance on ${workDate}: ${reason}`
          : `${managerName} issued a warning regarding your attendance on ${workDate}: ${reason}. Open Office > Attendance for details.`;
      ds.notifications.notify(managerKey, managerName, [staffKey], body, `attendance_${kind}`, 'attendance_note', note.id).catch(() => {});
      const staffList = await ds.staff.listAll().catch(() => []);
      const phone = staffList.find((p) => p.key === staffKey)?.phone;
      if (phone) ds.sms.send(phone, body, `attendance_${kind}`, managerKey).catch(() => {});
      return note;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendanceNotes'] }),
  });
}
