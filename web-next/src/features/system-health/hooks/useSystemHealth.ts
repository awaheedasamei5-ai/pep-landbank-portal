import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Port of index.html's System Health screen (systemHealthHtml(),
// index.html:21683) -- "a snapshot of things that can silently fail."
// Scoped to the two real signal sources this session ported/inventoried
// (Phase 0, see web-next/docs/PHASE0_INVENTORY.md): audit_events (critical
// findings + uncaught errors) and backups (the 6am/2pm/10pm cron's own
// output). SMS delivery / stuck approvals from the original screen are
// real, separate signal sources not wired here yet -- not silently
// dropped, just not yet ported.
export function useSystemHealth() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const enabled = !!profile && profile.role === 'manager';

  const auditQuery = useQuery({
    queryKey: ['systemHealthAudit', demoMode],
    enabled,
    queryFn: () => getDataSource(demoMode).audit.list(),
  });
  const backupsQuery = useQuery({
    queryKey: ['systemHealthBackups', demoMode],
    enabled,
    queryFn: () => getDataSource(demoMode).backups.list(),
  });

  const events = auditQuery.data ?? [];
  const backups = backupsQuery.data ?? [];
  const criticalEvents = events.filter((e) => e.severity === 'critical');
  const errorEvents = events.filter((e) => e.category === 'error');
  const lastBackup = backups[0] ?? null;
  // Reads wall-clock time directly -- oxlint's react(purity) rule flags
  // this (Date.now() during render), but there's no SSR/time-travel
  // concern in this client-only app, and useMemo doesn't actually change
  // the underlying impurity, only when it's re-evaluated. Matches the
  // existing tolerated-warning bar elsewhere in this codebase (the
  // incompatible-library warnings on ComposeMemoScreen/AddLeadScreen/etc.).
  const hoursSinceLastBackup = lastBackup ? (Date.now() - new Date(lastBackup.createdAt).getTime()) / 3_600_000 : null;

  return {
    isLoading: auditQuery.isLoading || backupsQuery.isLoading,
    criticalCount: criticalEvents.length,
    errorCount: errorEvents.length,
    latestCritical: criticalEvents[0] ?? null,
    lastBackup,
    // Real cron cadence is every 8h (6am/2pm/10pm) -- more than 9h since
    // the last one on file means a scheduled run was missed.
    backupOverdue: hoursSinceLastBackup != null && hoursSinceLastBackup > 9,
    backupCount: backups.length,
  };
}
