"use client";

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { isConfiguredWorkday } from '../lib/attendanceGeo';
import type { AttendancePolicy, AttendanceRecord, LeaveRequest } from '../../../types/domain';

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export type DayCell = {
  date: string;
  dayOfMonth: number;
  isFuture: boolean;
  isWorkday: boolean;
  isOnLeave: boolean;
  record: AttendanceRecord | null;
  isLate: boolean;
};

// Real V1 rule (not this repo's): a workday with no attendance row and no
// covering leave request is an absence -- everything else (weekend,
// future, on-leave, has a record) is not. Reused by both the calendar
// heatmap and the month KPI counts so the two never disagree with each
// other about what counts as "absent".
function buildMonthCells(monthStart: Date, today: Date, policy: AttendancePolicy | null, records: AttendanceRecord[], leaveDates: Set<string>): DayCell[] {
  const cells: DayCell[] = [];
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const byDate = new Map(records.map((r) => [r.workDate, r]));
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), d);
    const iso = date.toISOString().slice(0, 10);
    const isFuture = date > today;
    cells.push({
      date: iso,
      dayOfMonth: d,
      isFuture,
      isWorkday: isConfiguredWorkday(date, policy),
      isOnLeave: leaveDates.has(iso),
      record: byDate.get(iso) ?? null,
      isLate: !!byDate.get(iso)?.lateReason,
    });
  }
  return cells;
}

// Staff-facing month view -- Attendance plan Part 3 ("month KPIs/on-time
// ring, calendar heatmap") -- built from the same real data sources
// useAttendance() already queries (attendance_log via history(), the
// staff's own leave_requests, attendance_policy), just widened to a full
// calendar month instead of the last 14 days.
export function useAttendanceMonth(monthOffset = 0) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const staffKey = profile?.key ?? '';

  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [today, monthOffset]);
  const monthKey = monthKeyOf(monthStart);

  const { data: policy } = useQuery({
    queryKey: ['attendancePolicy'],
    queryFn: () => getDataSource(demoMode).attendancePolicy.current(),
  });

  const daysBack = useMemo(() => {
    const diffDays = Math.round((today.getTime() - monthStart.getTime()) / 86400000);
    return Math.max(35, diffDays + 35);
  }, [today, monthStart]);

  const { data: records, isLoading: isLoadingRecords } = useQuery({
    queryKey: ['attendanceHistory', staffKey, daysBack],
    enabled: !!staffKey,
    queryFn: () => getDataSource(demoMode).attendance.history(staffKey, daysBack),
  });

  const { data: leaveRequests } = useQuery({
    queryKey: ['leaveRequestsMine', staffKey],
    enabled: !!staffKey,
    queryFn: () => getDataSource(demoMode).leaveRequests.list(),
  });

  const leaveDates = useMemo(() => {
    const set = new Set<string>();
    (leaveRequests ?? [])
      .filter((r: LeaveRequest) => r.agentKey === staffKey && (r.status === 'approved' || r.status === 'pending'))
      .forEach((r: LeaveRequest) => r.dates.forEach((d) => set.add(d)));
    return set;
  }, [leaveRequests, staffKey]);

  const monthRecords = useMemo(() => {
    const monthPrefix = monthKey;
    return (records ?? []).filter((r) => r.workDate.startsWith(monthPrefix));
  }, [records, monthKey]);

  const cells = useMemo(() => buildMonthCells(monthStart, today, policy ?? null, monthRecords, leaveDates), [monthStart, today, policy, monthRecords, leaveDates]);

  const stats = useMemo(() => {
    const past = cells.filter((c) => !c.isFuture);
    const workdaysPast = past.filter((c) => c.isWorkday && !c.isOnLeave);
    const attended = workdaysPast.filter((c) => c.record?.signInAt);
    const onTime = attended.filter((c) => !c.isLate);
    const absences = workdaysPast.filter((c) => !c.record?.signInAt);
    const leaveDaysCount = past.filter((c) => c.isOnLeave).length;
    const attendanceRate = workdaysPast.length ? Math.round((attended.length / workdaysPast.length) * 100) : 100;
    const onTimeRate = attended.length ? Math.round((onTime.length / attended.length) * 100) : 100;
    // V1's real rule (Plan Part 1) -- a strict pass/fail, not a sliding
    // scale: on-time rate >= 90% AND at most 1 absence this month is
    // "on track", anything short of that is "at risk". No amber middle
    // state -- deliberately binary, matching V1 exactly.
    const onTrack = onTimeRate >= 90 && absences.length <= 1;
    return {
      workdaysSoFar: workdaysPast.length,
      daysAttended: attended.length,
      onTimeDays: onTime.length,
      lateDays: attended.length - onTime.length,
      absences: absences.length,
      leaveDaysCount,
      attendanceRate,
      onTimeRate,
      onTrack,
    };
  }, [cells]);

  return { monthStart, monthKey, cells, stats, policy: policy ?? null, isLoading: isLoadingRecords };
}
