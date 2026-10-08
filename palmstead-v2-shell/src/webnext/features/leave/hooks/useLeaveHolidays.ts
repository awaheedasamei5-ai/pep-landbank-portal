"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewLeaveHoliday } from '../../../types/domain';

// Real table `leave_holidays` (migration leave_full_app_phase1_schema) --
// read by any signed-in staff (calendar shading everywhere), written only
// from Management settings. See docs/plans/04-leave-full-app-build-plan.md.
export function useLeaveHolidays() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['leaveHolidays'], queryFn: () => getDataSource(demoMode).leaveHolidays.list() });
}

export function useCreateLeaveHoliday() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewLeaveHoliday) => getDataSource(demoMode).leaveHolidays.create(profile?.key ?? '', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveHolidays'] }),
  });
}

export function useRemoveLeaveHoliday() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).leaveHolidays.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leaveHolidays'] }),
  });
}
