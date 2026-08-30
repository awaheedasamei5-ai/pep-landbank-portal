import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { today } from '../../../shared/lib/format';
import type { ScheduleItemStatus } from '../../../types/domain';

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>, agentKey: string) {
  // Today's to-do completion directly drives the StreakCard's pre-deadline
  // mood (computeTodayTodoProgress -> todayProgress, see
  // features/streak/lib/moodLogic.ts) -- every write here has to invalidate
  // todayStreak too, not just the todo list itself, or the Home screen
  // would show a stale mood after a real change.
  queryClient.invalidateQueries({ queryKey: ['todayTodos', agentKey] });
  queryClient.invalidateQueries({ queryKey: ['todayStreak', agentKey] });
}

export function useTodayTodos() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['todayTodos', agentKey],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).scheduleItems.listForAgentOnDate(agentKey, today()),
  });
}

export function useCreateTodo() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ title, assignedTo }: { title: string; assignedTo?: string }) => getDataSource(demoMode).scheduleItems.create(agentKey, today(), title, assignedTo),
    onSuccess: () => invalidateAll(queryClient, agentKey),
  });
}

export function useUpdateTodoStatus() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ScheduleItemStatus }) => getDataSource(demoMode).scheduleItems.updateStatus(id, status),
    onSuccess: () => invalidateAll(queryClient, agentKey),
  });
}
