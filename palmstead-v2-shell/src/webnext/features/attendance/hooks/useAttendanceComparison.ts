"use client";

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

function cutoffHHMM(policy: { workStartTime: string; graceMinutes: number } | null): string {
  if (!policy) return '09:00';
  const [h, m] = policy.workStartTime.split(':').map(Number);
  const total = h * 60 + m + policy.graceMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// "You vs the team" (ATTENDANCE_BLUEPRINT.md §6) -- backed by the real
// get_attendance_month_comparison() SECURITY DEFINER RPC (confirmed live
// 2026-09-11), the only way a regular staff session can see anyone
// else's attendance at all under real RLS (al_sel_own_or_mgr is own-or-
// manager only). The RPC's own on-time definition is a plain sign-in
// time-of-day cutoff, not the fuller policy+workday logic in
// attendanceGeo.ts -- deliberately kept in sync with the RPC's real SQL
// (cutoff = work_start_time + grace_minutes) rather than re-deriving a
// different "on time" than what the company-wide ranking uses.
export function useAttendanceComparison(monthKey: string) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const staffKey = profile?.key ?? '';

  const { data: policy } = useQuery({
    queryKey: ['attendancePolicy'],
    queryFn: () => getDataSource(demoMode).attendancePolicy.current(),
  });

  const cutoff = cutoffHHMM(policy ?? null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['attendanceMonthComparison', monthKey, cutoff],
    queryFn: () => getDataSource(demoMode).attendance.monthComparison(monthKey, cutoff),
  });

  const result = useMemo(() => {
    const list = rows ?? [];
    const ranked = [...list].sort((a, b) => b.onTimeDays - a.onTimeDays || b.daysAttended - a.daysAttended);
    const you = ranked.find((r) => r.staffKey === staffKey) ?? null;
    const rank = you ? ranked.findIndex((r) => r.staffKey === staffKey) + 1 : null;
    const teamCount = ranked.length;
    const teamAvgOnTime = teamCount ? Math.round((list.reduce((s, r) => s + r.onTimeDays, 0) / teamCount) * 10) / 10 : 0;
    const teamAvgAttended = teamCount ? Math.round((list.reduce((s, r) => s + r.daysAttended, 0) / teamCount) * 10) / 10 : 0;
    return { you, rank, teamCount, teamAvgOnTime, teamAvgAttended, ranked };
  }, [rows, staffKey]);

  return { ...result, isLoading };
}
