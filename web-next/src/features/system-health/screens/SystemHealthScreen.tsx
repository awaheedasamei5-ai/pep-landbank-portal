import { useNavigate } from 'react-router';
import { Icon } from '../../../shared/ui/Icon';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { useSystemHealth } from '../hooks/useSystemHealth';
import { useSystemHealthSummary } from '../hooks/useSystemHealthSummary';
import { useAiProviderStatus } from '../hooks/useAiProviderStatus';
import styles from './SystemHealthScreen.module.css';

function fmtDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

function fmtBytes(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Port of index.html's System Health screen (systemHealthHtml(),
// index.html:21683-21722) -- see useSystemHealth.ts's own comment for what
// signal sources this covers vs the original screen's fuller set. The
// Scheduled Jobs list and Last Report row are new -- Master Rebuild Spec
// Section 3.5's System Health checklist names both explicitly ("scheduled
// jobs", "last successful report"), and this screen had neither before.
export function SystemHealthScreen() {
  const navigate = useNavigate();
  const health = useSystemHealth();
  const { data: summary } = useSystemHealthSummary(health);
  const { data: aiStatus } = useAiProviderStatus();

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>Management</div>
      <h1 className={styles.title}>System Health</h1>
      <p className={styles.sub}>Audit trail, automated backups & scheduled jobs — real signal, not a synthetic status page.</p>

      {health.isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      {!health.isLoading && (
        <>
          <PipePillStrip>
            <PipePill tone={health.criticalCount > 0 ? 'red' : 'green'} value={health.criticalCount} label="Critical events" />
            <PipePill tone={health.jobsFailing > 0 ? 'red' : 'green'} value={health.jobsFailing} label="Jobs failing" />
            <PipePill tone={health.backupOverdue ? 'red' : 'green'} value={health.lastBackup ? fmtDate(health.lastBackup.createdAt).slice(5) : '—'} label="Last backup" />
          </PipePillStrip>

          {health.backupOverdue && <div className={styles.alertBanner}>⚠ No backup on file in the last 9 hours — the scheduled cron may have missed a run.</div>}
          {health.reportOverdue && <div className={styles.alertBanner}>⚠ No daily management report on file in the last 27 hours — the scheduled cron may have missed a run.</div>}
          {health.latestCritical && (
            <div className={styles.alertBanner}>
              ⚠ {health.latestCritical.summary} — {fmtDate(health.latestCritical.createdAt)}
            </div>
          )}

          {summary && (
            <div className={styles.aiSummary}>
              <span className={styles.aiBadge}>AI</span>
              <span>{summary}</span>
            </div>
          )}

          <div className={styles.sectionTitle}>Scheduled jobs</div>
          <div className={styles.jobList}>
            <div className={styles.jobRow}>
              <div>
                <div className={styles.jobName}>AI provider (Groq)</div>
                <div className={styles.jobCadence}>Powers every AI feature across the app</div>
              </div>
              <span className={`${styles.jobStatus} ${aiStatus === 'connected' ? styles.jobStatusOk : styles.jobStatusFail}`}>
                {aiStatus === 'connected' ? 'Connected' : aiStatus === 'not_configured' ? 'Not configured' : aiStatus === 'unreachable' ? 'Unreachable' : 'Checking…'}
              </span>
            </div>
            <div className={styles.jobRow}>
              <div>
                <div className={styles.jobName}>Daily management report</div>
                <div className={styles.jobCadence}>Daily, 9:00am</div>
              </div>
              <span className={`${styles.jobStatus} ${health.lastReportFailed ? styles.jobStatusFail : styles.jobStatusOk}`}>
                {health.latestReport ? (health.lastReportFailed ? 'Failed' : `Sent ${fmtDate(health.latestReport.generatedAt).slice(5)}`) : 'No runs on file'}
              </span>
            </div>
            {health.lastReportFailed && health.latestReport?.errorDetail && <div className={styles.jobFailDetail}>{health.latestReport.errorDetail}</div>}
            {health.jobs.map((job) => (
              <div key={job.key}>
                <div className={styles.jobRow}>
                  <div>
                    <div className={styles.jobName}>{job.label}</div>
                    <div className={styles.jobCadence}>{job.cadenceLabel}</div>
                  </div>
                  <span className={`${styles.jobStatus} ${job.failing ? styles.jobStatusFail : styles.jobStatusOk}`}>{job.failing ? 'Failing' : 'Healthy'}</span>
                </div>
                {job.failing && job.lastFailure && <div className={styles.jobFailDetail}>{job.lastFailure.summary}</div>}
              </div>
            ))}
          </div>

          <div className={styles.sectionTitle}>Detail</div>
          <div className={styles.cardGrid}>
            <button type="button" className={styles.card} onClick={() => navigate('/app/mgr/health/audit')}>
              <span className={styles.cardIcon}>
                <Icon name="warning" size={20} />
              </span>
              <span className={styles.cardTitle}>Audit Log</span>
              <span className={styles.cardSub}>Sensitive actions, integrity findings, client errors & scheduled-job failures</span>
            </button>
            <button type="button" className={styles.card} onClick={() => navigate('/app/mgr/health/backups')}>
              <span className={styles.cardIcon}>
                <Icon name="checklist" size={20} />
              </span>
              <span className={styles.cardTitle}>Backup & Restore</span>
              <span className={styles.cardSub}>
                {health.backupCount} backup{health.backupCount === 1 ? '' : 's'} on file
                {health.lastBackup ? ` · ${fmtBytes(health.lastBackup.sizeBytes)} latest` : ''}
              </span>
            </button>
            <button type="button" className={styles.card} onClick={() => navigate('/app/mgr/health/permissions')}>
              <span className={styles.cardIcon}>
                <Icon name="settings" size={20} />
              </span>
              <span className={styles.cardTitle}>Permissions</span>
              <span className={styles.cardSub}>Grant/revoke matrix for who can do what beyond agent/manager</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
