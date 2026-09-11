import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { ScheduleItemPatch } from '../../../types/domain';

// Master Spec 10.2's richer task-record fields (notes, linked lead/site
// visit, dependency, activity history, attachments) -- kept in a
// separate hooks file from useTasks.ts's board-level list/create/status/
// reassign, since these all operate on ONE already-loaded task rather
// than the board's list.
function useInvalidateTasksBoard() {
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  const isManager = profile?.role === 'manager';
  const agentKey = profile?.key ?? '';
  return () => queryClient.invalidateQueries({ queryKey: ['tasks', isManager ? 'all' : agentKey] });
}

export function useUpdateScheduleItem() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const invalidate = useInvalidateTasksBoard();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ScheduleItemPatch }) => getDataSource(demoMode).scheduleItems.update(id, patch),
    onSuccess: invalidate,
  });
}

export function useTaskEvents(taskId: string | null) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['taskEvents', taskId],
    queryFn: () => getDataSource(demoMode).taskEvents.listForTask(taskId as string),
    enabled: !!taskId,
  });
}

export function useTaskAttachments(taskId: string | null) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['taskAttachments', taskId],
    queryFn: () => getDataSource(demoMode).scheduleItemAttachments.listForItem(taskId as string),
    enabled: !!taskId,
  });
}

export function useUploadTaskAttachment() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, file }: { taskId: string; file: File }) =>
      getDataSource(demoMode).scheduleItemAttachments.upload(taskId, file, file.name, file.type || 'application/octet-stream', profile?.key ?? '', profile?.name ?? ''),
    onSuccess: (_r, { taskId }) => queryClient.invalidateQueries({ queryKey: ['taskAttachments', taskId] }),
  });
}

export function useRemoveTaskAttachment() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, storagePath }: { id: string; storagePath: string; taskId: string }) => getDataSource(demoMode).scheduleItemAttachments.remove(id, storagePath),
    onSuccess: (_r, { taskId }) => queryClient.invalidateQueries({ queryKey: ['taskAttachments', taskId] }),
  });
}

export function useDownloadTaskAttachment() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useMutation({
    mutationFn: async (storagePath: string) => {
      const url = await getDataSource(demoMode).scheduleItemAttachments.getUrl(storagePath);
      if (url) window.open(url, '_blank', 'noopener');
      return url;
    },
  });
}
