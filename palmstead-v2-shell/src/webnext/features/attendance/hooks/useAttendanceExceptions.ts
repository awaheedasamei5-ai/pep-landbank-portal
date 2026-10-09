"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewAttendanceException } from '../../../types/domain';

// Real gap closed 2026-10-09: attendanceExceptions.create() was already
// wired in the data source and RLS, but nothing staff-facing ever called
// it -- only Management's decide-queue existed. list() trusts RLS to
// scope to the caller's own requests for a non-manager session (same
// pattern as leaveRequests.list()).
export function useMyAttendanceExceptions() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const myKey = profile?.key ?? '';
  return useQuery({
    queryKey: ['attendanceExceptions'],
    queryFn: async () => (await getDataSource(demoMode).attendanceExceptions.list()).filter((e) => e.staffKey === myKey),
    enabled: !!myKey,
  });
}

export function useRequestAttendanceException() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewAttendanceException) => getDataSource(demoMode).attendanceExceptions.create(profile?.key ?? '', profile?.name ?? '', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendanceExceptions'] }),
  });
}
