import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

export function useTeamRoster() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['teamRoster'],
    queryFn: async () => (await getDataSource(demoMode).staff.listAll()).filter((p) => p.role === 'agent'),
  });
}

export function useSetStaffActive() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, active }: { key: string; active: boolean }) => getDataSource(demoMode).staff.setActive(key, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamRoster'] });
      // Deactivating/reactivating changes who shows up in every other
      // active-only staff picker (Memorandum's recipients, Company
      // Leads' assign dropdown).
      queryClient.invalidateQueries({ queryKey: ['agentRoster'] });
      queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
  });
}

// Real table `allowed_emails`, manager-only RLS added 2026-09-04 -- see
// StaffInvite's comment in types/domain.ts for why this exists (gating
// real signUp() so any email can't self-provision a real agent account
// anymore).
export function useStaffInvites() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['staffInvites'],
    queryFn: () => getDataSource(demoMode).staffInvites.list(),
  });
}

export function useCreateStaffInvite() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, name }: { email: string; name: string }) => getDataSource(demoMode).staffInvites.create(email.trim().toLowerCase(), name.trim(), profile?.name ?? 'Management'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staffInvites'] }),
  });
}

export function useRemoveStaffInvite() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => getDataSource(demoMode).staffInvites.remove(email),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staffInvites'] }),
  });
}
