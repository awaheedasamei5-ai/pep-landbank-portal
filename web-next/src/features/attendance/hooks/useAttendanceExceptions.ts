import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewAttendanceException } from '../../../types/domain';

// Real V3 chapter-01 entity -- see AttendanceException's own doc comment
// in types/domain.ts. list() returns every request its RLS/demo scope
// allows (own requests, or all for a manager session) -- callers filter
// further by role/status themselves, same convention as leaveRequests.
export function useAttendanceExceptions() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['attendanceExceptions', demoMode], queryFn: () => getDataSource(demoMode).attendanceExceptions.list() });
}

export function useCreateAttendanceException() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewAttendanceException) => getDataSource(demoMode).attendanceExceptions.create(profile?.key ?? '', profile?.name ?? '', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendanceExceptions'] }),
  });
}

export function useDecideAttendanceException() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'declined' }) => getDataSource(demoMode).attendanceExceptions.decide(id, status, profile?.key ?? '', profile?.name ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendanceExceptions'] }),
  });
}
