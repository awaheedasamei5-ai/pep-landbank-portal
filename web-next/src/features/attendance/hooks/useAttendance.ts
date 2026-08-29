import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { SignInInput, SignOutInput } from '../../../types/domain';

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
