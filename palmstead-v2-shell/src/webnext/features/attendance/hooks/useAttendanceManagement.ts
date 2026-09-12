"use client";

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { detectAttendancePatterns } from '../lib/attendanceRosterLogic';
import type { NewOfficeLocation } from '../../../types/domain';

// Management's real view of the whole company's Attendance -- Attendance
// plan Part 4 ("everything about how attendance is judged lives here").
// One orchestration hook for the four things Management actually opens
// this for: who's in today, whose pattern needs a note, whose exception
// request is waiting, and the policy/office-location settings that
// decide what "late" and "at the office" even mean.
export function useAttendanceManagement() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  const managerKey = profile?.key ?? '';
  const managerName = profile?.name ?? '';

  const invalidate = useCallback(
    (keys: string[]) => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })),
    [queryClient],
  );

  const { data: today, isLoading: isLoadingToday } = useQuery({
    queryKey: ['attendanceListToday'],
    queryFn: () => getDataSource(demoMode).attendance.listToday(),
  });

  const { data: recent30, isLoading: isLoadingRecent } = useQuery({
    queryKey: ['attendanceListRange', 30],
    queryFn: () => getDataSource(demoMode).attendance.listRange(30),
  });

  const { data: policy } = useQuery({
    queryKey: ['attendancePolicy'],
    queryFn: () => getDataSource(demoMode).attendancePolicy.current(),
  });

  const { data: officeLocations } = useQuery({
    queryKey: ['officeLocations'],
    queryFn: () => getDataSource(demoMode).officeLocations.list(),
  });

  const { data: exceptions } = useQuery({
    queryKey: ['attendanceExceptions'],
    queryFn: () => getDataSource(demoMode).attendanceExceptions.list(),
  });

  const { data: notes } = useQuery({
    queryKey: ['attendanceNotes'],
    queryFn: () => getDataSource(demoMode).attendanceNotes.list(),
  });

  const pendingExceptions = useMemo(() => (exceptions ?? []).filter((e) => e.status === 'pending'), [exceptions]);

  const suggestions = useMemo(
    () => detectAttendancePatterns(recent30 ?? [], notes ?? [], policy ?? null),
    [recent30, notes, policy],
  );

  const decideException = useCallback(
    async (id: string, status: 'approved' | 'declined') => {
      await getDataSource(demoMode).attendanceExceptions.decide(id, status, managerKey, managerName);
      invalidate(['attendanceExceptions']);
    },
    [demoMode, managerKey, managerName, invalidate],
  );

  const issueNote = useCallback(
    async (staffKey: string, staffName: string, kind: 'praise' | 'warning', reason: string, workDate: string) => {
      await getDataSource(demoMode).attendanceNotes.issue(staffKey, staffName, kind, reason, workDate, managerKey, managerName);
      invalidate(['attendanceNotes']);
    },
    [demoMode, managerKey, managerName, invalidate],
  );

  const updatePolicy = useCallback(
    async (input: { workStartTime: string; workEndTime: string; graceMinutes: number; workDays: number[] }) => {
      await getDataSource(demoMode).attendancePolicy.update(managerKey, managerName, input);
      invalidate(['attendancePolicy']);
    },
    [demoMode, managerKey, managerName, invalidate],
  );

  const createOfficeLocation = useCallback(
    async (input: NewOfficeLocation) => {
      await getDataSource(demoMode).officeLocations.create(managerKey, managerName, input);
      invalidate(['officeLocations']);
    },
    [demoMode, managerKey, managerName, invalidate],
  );

  const updateOfficeLocation = useCallback(
    async (id: string, patch: Partial<NewOfficeLocation & { isActive: boolean }>) => {
      await getDataSource(demoMode).officeLocations.update(id, patch);
      invalidate(['officeLocations']);
    },
    [demoMode, invalidate],
  );

  const removeOfficeLocation = useCallback(
    async (id: string) => {
      await getDataSource(demoMode).officeLocations.remove(id);
      invalidate(['officeLocations']);
    },
    [demoMode, invalidate],
  );

  const correctRecord = useCallback(
    async (id: string, patch: { signInAt?: string | null; signOutAt?: string | null }) => {
      await getDataSource(demoMode).attendance.update(id, patch);
      invalidate(['attendanceListToday', 'attendanceListRange']);
    },
    [demoMode, invalidate],
  );

  const removeRecord = useCallback(
    async (id: string) => {
      await getDataSource(demoMode).attendance.remove(id);
      invalidate(['attendanceListToday', 'attendanceListRange']);
    },
    [demoMode, invalidate],
  );

  const resetAll = useCallback(async () => {
    await getDataSource(demoMode).attendance.resetAll();
    invalidate(['attendanceListToday', 'attendanceListRange']);
  }, [demoMode, invalidate]);

  return {
    today: today ?? [],
    isLoadingToday,
    recent30: recent30 ?? [],
    isLoadingRecent,
    policy: policy ?? null,
    officeLocations: officeLocations ?? [],
    exceptions: exceptions ?? [],
    pendingExceptions,
    notes: notes ?? [],
    suggestions,
    decideException,
    issueNote,
    updatePolicy,
    createOfficeLocation,
    updateOfficeLocation,
    removeOfficeLocation,
    correctRecord,
    removeRecord,
    resetAll,
  };
}
