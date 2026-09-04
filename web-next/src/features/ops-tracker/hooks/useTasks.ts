import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewTask, ScheduleItemStatus } from '../../../types/domain';

// Task Board (Master Spec Section 10.1) -- kind='task' schedule_items,
// separate query keys from My Day's kind='todo' ones (useTodayTodos.ts)
// even though both read the same table, so a task write never
// invalidates/refetches the todo list and vice versa.
export function useTasks() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = profile?.role === 'manager';
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['tasks', isManager ? 'all' : agentKey],
    enabled: !!agentKey,
    queryFn: () => (isManager ? getDataSource(demoMode).scheduleItems.listAllTasks() : getDataSource(demoMode).scheduleItems.listTasksForAgent(agentKey)),
  });
}

function useInvalidateTasks() {
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  const isManager = profile?.role === 'manager';
  const agentKey = profile?.key ?? '';
  return () => queryClient.invalidateQueries({ queryKey: ['tasks', isManager ? 'all' : agentKey] });
}

// SMS to the assignee when a task lands on someone else -- matches
// apiInsertTask's real behavior (index.html:5323-5324), fire-and-forget
// same as every other sms.send() call site.
export function useCreateTask() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: async (input: NewTask) => {
      const task = await getDataSource(demoMode).scheduleItems.createTask(profile?.key ?? '', profile?.name ?? '', input);
      if (input.assignedTo && input.assignedTo !== profile?.key) {
        const staff = await getDataSource(demoMode)
          .staff.listAll()
          .catch(() => []);
        const phone = staff.find((s) => s.key === input.assignedTo)?.phone;
        if (phone) {
          getDataSource(demoMode)
            .sms.send(phone, `New task from ${profile?.name ?? ''}: "${input.title}". Open Palmstead to view it.`, 'task_assigned', profile?.key ?? null)
            .catch(() => {});
        }
      }
      return task;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTaskStatus() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ScheduleItemStatus }) => getDataSource(demoMode).scheduleItems.updateStatus(id, status),
    onSuccess: invalidate,
  });
}

export function useReassignTask() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ id, toKey, toName }: { id: string; toKey: string; toName: string }) => getDataSource(demoMode).scheduleItems.reassignTask(id, toKey, toName, profile?.key ?? '', profile?.name ?? ''),
    onSuccess: invalidate,
  });
}
