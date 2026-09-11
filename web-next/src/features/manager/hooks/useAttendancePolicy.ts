import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Real V3 chapter-01 entity -- see AttendancePolicy's own doc comment in
// types/domain.ts. update() calls the set_attendance_policy() SECURITY
// DEFINER RPC (manager-only, atomically versions the row) via the data
// source, never a direct table write.
export function useAttendancePolicy() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['attendancePolicy', demoMode], queryFn: () => getDataSource(demoMode).attendancePolicy.current() });
}

export function useAttendancePolicyHistory() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['attendancePolicyHistory', demoMode], queryFn: () => getDataSource(demoMode).attendancePolicy.history() });
}

export function useUpdateAttendancePolicy() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { workStartTime: string; workEndTime: string; graceMinutes: number; workDays: number[] }) =>
      getDataSource(demoMode).attendancePolicy.update(profile?.key ?? '', profile?.name ?? '', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendancePolicy'] });
      queryClient.invalidateQueries({ queryKey: ['attendancePolicyHistory'] });
    },
  });
}
