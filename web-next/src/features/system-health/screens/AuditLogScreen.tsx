import { useNavigate } from 'react-router';
import { useAuditLog } from '../hooks/useAuditLog';
import styles from './AuditLogScreen.module.css';

const CATEGORIES = ['all', 'audit', 'integrity', 'error', 'cron'] as const;

function fmtDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

// Port of index.html's Audit Log screen (auditLogHtml(), index.html:21723-
// 21742) -- Management-only browsable view of audit_events: sensitive
// audit actions, daily integrity findings, and uncaught client errors.
export function AuditLogScreen() {
  const navigate = useNavigate();
  const { events, isLoading, category, setCategory, criticalOnly, setCriticalOnly } = useAuditLog();

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>System Health</div>
      <h1 className={styles.title}>Audit Log</h1>
      <p className={styles.sub}>Every sensitive action, integrity finding and uncaught error, most recent first.</p>

      <div className={styles.filterRow}>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={`${styles.chip} ${category === c ? styles.chipOn : ''}`} onClick={() => setCategory(c)}>
            {c === 'all' ? 'All' : c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
        <button type="button" className={`${styles.chip} ${criticalOnly ? styles.chipOn : ''}`} onClick={() => setCriticalOnly((v) => !v)}>
          Critical only
        </button>
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {!isLoading && events.length === 0 && <p className={styles.emptyMsg}>Nothing matches this filter.</p>}

      <div className={styles.list}>
        {events.map((e) => (
          <div key={e.id} className={`${styles.row} ${styles[e.severity]}`}>
            <div className={styles.rowTop}>
              <span className={styles.eventType}>{e.eventType}</span>
              <span className={styles.severityTag}>{e.severity}</span>
            </div>
            <div className={styles.summary}>{e.summary}</div>
            <div className={styles.meta}>
              {fmtDate(e.createdAt)}
              {e.actorName ? ` · ${e.actorName}` : ''} · {e.category}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
