import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { AuditEvent } from '../../../types/domain';

// Port of index.html's System Health screen (systemHealthHtml(),
// index.html:21683) -- "a snapshot of things that can silently fail."
// audit_events + backups were the Phase 0 cut; this pass adds the master
// spec's explicit "scheduled jobs" and "last successful report" System
// Health lines (Section 3.5), sourced from report_archive (ported to
// staging 2026-09-03) and audit_events' existing 'cron' category. SMS
// delivery / stuck approvals from the original screen are real, separate
// signal sources not wired here yet -- not silently dropped, just not yet
// ported.

// Real, hand-maintained cadences for the jobs that report through the
// 'cron' audit category rather than their own dedicated table (unlike
// daily-management-report, which has report_archive, or the backup jobs,
// which have `backups`) -- matches how backupOverdue below already treats
// "expected every 8h" as a known business fact, not a live pg_cron read.
// Reading cron.job directly would need a new production RPC/view (cron.job
// lives outside PostgREST's exposed schemas) -- deliberately not added
// this pass; these four names/cadences are the real ones confirmed live
// (send-todo-alarms, daily-reminders, scheduled-integrity-check,
// monthly-commission-check -- the backup jobs get their own `backups`-
// sourced card, not this list).
//
// staleAfterHours: how long a real failure keeps the job flagged red. Not
// literally "how overdue is the next run" -- there's no matching
// success-path event to supersede a failure with (deliberately, to avoid
// writing an audit row every single minute for send-todo-alarms), so a
// failure has to age out on its own instead of being cleared by a later
// success. monthly-commission-check gets a long window (real runs are
// rare) rather than a permanent one, so a long-since-fixed issue
// eventually stops being highlighted.
const CRON_JOBS: { key: string; label: string; cadenceLabel: string; staleAfterHours: number; matchesSummary: (s: string) => boolean }[] = [
  { key: 'send-todo-alarms', label: 'To-do push alarms', cadenceLabel: 'Every minute', staleAfterHours: 0.25, matchesSummary: (s) => s.includes('send-todo-alarms') },
  { key: 'daily-reminders', label: 'Birthdays & payment reminders', cadenceLabel: 'Daily, 7:00am', staleAfterHours: 27, matchesSummary: (s) => s.includes('daily-reminders') },
  { key: 'scheduled-integrity-check', label: 'Data integrity check', cadenceLabel: 'Daily, 8:00am', staleAfterHours: 27, matchesSummary: (s) => s.includes('scheduled-integrity-check') },
  { key: 'monthly-commission-check', label: 'Monthly commission finalize', cadenceLabel: 'Checked daily, acts once per month', staleAfterHours: 800, matchesSummary: (s) => s.includes('run_monthly_commission_check') || s.includes('monthly-commission') },
];

export interface CronJobHealth {
  key: string;
  label: string;
  cadenceLabel: string;
  lastFailure: AuditEvent | null;
  failing: boolean;
}

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
  const cronEventsQuery = useQuery({
    queryKey: ['systemHealthCronEvents', demoMode],
    enabled,
    queryFn: () => getDataSource(demoMode).audit.list({ category: 'cron' }),
  });
  const reportsQuery = useQuery({
    queryKey: ['systemHealthReports', demoMode],
    enabled,
    queryFn: () => getDataSource(demoMode).reportArchive.list(10),
  });

  const events = auditQuery.data ?? [];
  const backups = backupsQuery.data ?? [];
  const cronEvents = cronEventsQuery.data ?? [];
  const reports = reportsQuery.data ?? [];
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

  const latestReport = reports[0] ?? null;
  const hoursSinceLastReport = latestReport ? (Date.now() - new Date(latestReport.generatedAt).getTime()) / 3_600_000 : null;
  // Runs daily at 9am -- more than 27h since the last archived attempt
  // (success or failure both count as "it ran") means the scheduled
  // trigger itself may have stopped firing, not just that the report failed.
  const reportOverdue = hoursSinceLastReport != null && hoursSinceLastReport > 27;
  const lastReportFailed = latestReport?.generationStatus === 'failed' || latestReport?.emailStatus === 'failed';

  const jobs: CronJobHealth[] = CRON_JOBS.map((job) => {
    const failures = cronEvents.filter((e) => e.severity === 'critical' && job.matchesSummary(e.summary));
    const lastFailure = failures[0] ?? null;
    const hoursSinceFailure = lastFailure ? (Date.now() - new Date(lastFailure.createdAt).getTime()) / 3_600_000 : null;
    const failing = hoursSinceFailure != null && hoursSinceFailure < job.staleAfterHours;
    return { key: job.key, label: job.label, cadenceLabel: job.cadenceLabel, lastFailure, failing };
  });
  const jobsFailing = jobs.filter((j) => j.failing).length;

  return {
    isLoading: auditQuery.isLoading || backupsQuery.isLoading || cronEventsQuery.isLoading || reportsQuery.isLoading,
    criticalCount: criticalEvents.length,
    errorCount: errorEvents.length,
    latestCritical: criticalEvents[0] ?? null,
    lastBackup,
    // Real cron cadence is every 8h (6am/2pm/10pm) -- more than 9h since
    // the last one on file means a scheduled run was missed.
    backupOverdue: hoursSinceLastBackup != null && hoursSinceLastBackup > 9,
    backupCount: backups.length,
    latestReport,
    reportOverdue,
    lastReportFailed,
    jobs,
    jobsFailing,
  };
}
