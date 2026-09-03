import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Port of index.html's Backup & Restore flow (apiCreateBackupNow/
// apiRestoreBackupNow, index.html:21442-21630). Both RPCs already exist,
// tested, on both projects -- see PHASE0_INVENTORY.md -- this is purely
// the web-next surface for an already-real capability. restore() is
// manager-gated server-side (restore_backup() itself raises otherwise)
// and takes its own pre-restore safety snapshot automatically -- the
// "type RESTORE to confirm" step below matches index.html's own
// openRestoreConfirmModal() bar for this one destructive action.
export function useBackups() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['backups', demoMode],
    enabled: !!profile && profile.role === 'manager',
    queryFn: () => getDataSource(demoMode).backups.list(),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['backups', demoMode] });
    queryClient.invalidateQueries({ queryKey: ['systemHealthBackups', demoMode] });
    queryClient.invalidateQueries({ queryKey: ['auditLog', demoMode] });
    queryClient.invalidateQueries({ queryKey: ['systemHealthAudit', demoMode] });
  }

  const createNow = useMutation({
    mutationFn: () => getDataSource(demoMode).backups.createNow(profile?.key ?? '', profile?.name ?? ''),
    onSuccess: invalidate,
  });

  const restore = useMutation({
    mutationFn: (backupId: string) => getDataSource(demoMode).backups.restore(backupId, profile?.key ?? '', profile?.name ?? ''),
    onSuccess: invalidate,
  });

  return { backups: query.data ?? [], isLoading: query.isLoading, createNow, restore };
}
