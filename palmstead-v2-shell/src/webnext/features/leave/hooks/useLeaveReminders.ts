"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { getDataSource } from '../../../data/source';

export function useLeaveReminderHealth() {
  const profile = useSessionStore((state) => state.profile);
  return useQuery({
    queryKey: ['leaveReminderHealth', profile?.key],
    queryFn: () => getDataSource().leaveRequests.reminderHealth(),
    enabled: profile?.role === 'manager',
    refetchInterval: 30_000,
  });
}

export function useRetryFailedLeaveReminder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource().leaveRequests.retryFailedReminder(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['leaveReminderHealth'] }),
  });
}
