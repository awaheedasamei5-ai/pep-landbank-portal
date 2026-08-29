import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewNote } from '../../../types/domain';

export function useNotes() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const ownerKey = profile?.key ?? '';
  return useQuery({
    queryKey: ['notes', ownerKey],
    enabled: !!ownerKey,
    queryFn: () => getDataSource(demoMode).notes.listForOwner(ownerKey),
  });
}

export function useCreateNote() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const ownerKey = profile?.key ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewNote) => getDataSource(demoMode).notes.create(ownerKey, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useUpdateNote() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: NewNote }) => getDataSource(demoMode).notes.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useDeleteNote() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).notes.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });
}
