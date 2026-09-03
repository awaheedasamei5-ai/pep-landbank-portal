import { useNavigate } from 'react-router';
import { Icon } from '../../../shared/ui/Icon';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { useSystemHealth } from '../hooks/useSystemHealth';
import styles from './SystemHealthScreen.module.css';

function fmtDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

function fmtBytes(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Port of index.html's System Health screen (systemHealthHtml(),
// index.html:21683-21722) -- see useSystemHealth.ts's own comment for what
// signal sources this first cut covers vs the original screen's fuller set.
export function SystemHealthScreen() {
  const navigate = useNavigate();
  const health = useSystemHealth();

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>Management</div>
      <h1 className={styles.title}>System Health</h1>
      <p className={styles.sub}>Audit trail & automated backups — real signal, not a synthetic status page.</p>

      {health.isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      {!health.isLoading && (
        <>
          <PipePillStrip>
            <PipePill tone={health.criticalCount > 0 ? 'red' : 'green'} value={health.criticalCount} label="Critical events" />
            <PipePill tone={health.errorCount > 0 ? 'orange' : 'green'} value={health.errorCount} label="Client errors logged" />
            <PipePill tone={health.backupOverdue ? 'red' : 'green'} value={health.lastBackup ? fmtDate(health.lastBackup.createdAt).slice(5) : '—'} label="Last backup" />
          </PipePillStrip>

          {health.backupOverdue && <div className={styles.alertBanner}>⚠ No backup on file in the last 9 hours — the scheduled cron may have missed a run.</div>}
          {health.latestCritical && (
            <div className={styles.alertBanner}>
              ⚠ {health.latestCritical.summary} — {fmtDate(health.latestCritical.createdAt)}
            </div>
          )}

          <div className={styles.cardGrid}>
            <button type="button" className={styles.card} onClick={() => navigate('/app/mgr/health/audit')}>
              <span className={styles.cardIcon}>
                <Icon name="warning" size={20} />
              </span>
              <span className={styles.cardTitle}>Audit Log</span>
              <span className={styles.cardSub}>Sensitive actions, integrity findings & client errors</span>
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
