import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource, type ReceivedMemo } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewMemo } from '../../../types/domain';

function useMyKey(): string {
  const profile = useSessionStore((s) => s.profile);
  return profile?.key ?? '';
}

export function useStaffDirectory() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['staff'], queryFn: () => getDataSource(demoMode).staff.list() });
}

export function useSentMemos() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const myKey = useMyKey();
  return useQuery({ queryKey: ['memos', 'sent', myKey], enabled: !!myKey, queryFn: () => getDataSource(demoMode).memos.sent(myKey) });
}

export function useDraftMemos() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const myKey = useMyKey();
  return useQuery({ queryKey: ['memos', 'drafts', myKey], enabled: !!myKey, queryFn: () => getDataSource(demoMode).memos.drafts(myKey) });
}

export function useReceivedMemos() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const myKey = useMyKey();
  return useQuery({ queryKey: ['memos', 'received', myKey], enabled: !!myKey, queryFn: () => getDataSource(demoMode).memos.received(myKey) });
}

export function useCreateMemo() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const myKey = profile?.key ?? '';
  const myName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewMemo) => getDataSource(demoMode).memos.create(myKey, myName, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memos'] }),
  });
}

export function useSendMemo() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).memos.send(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memos'] }),
  });
}

export function useMarkMemoRead() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (item: ReceivedMemo) => getDataSource(demoMode).memos.markRead(item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memos'] }),
  });
}

export function useDeleteMemo() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).memos.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memos'] }),
  });
}
