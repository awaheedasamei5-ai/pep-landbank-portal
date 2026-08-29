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
