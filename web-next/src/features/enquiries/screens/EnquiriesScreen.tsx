import { useNavigate } from 'react-router';
import { useEnquiries } from '../hooks/useEnquiries';
import styles from './EnquiriesScreen.module.css';

// Agent-scoped via agent_key exactly like leads/site_visits (confirmed
// live) -- listForAgent() already enforces it server-side. `types` is
// split back into chips here purely for display; it's stored as one
// comma-joined string, matching the real column's shape.
export function EnquiriesScreen() {
  const navigate = useNavigate();
  const { data: enquiries, isLoading } = useEnquiries();

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Client enquiries</h1>
          <p className={styles.sub}>{enquiries?.length ?? 0} logged</p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => navigate('/app/sales/enquiries/new')}>
          + Log enquiry
        </button>
      </div>

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {enquiries?.map((e) => (
        <div className={styles.card} key={e.id}>
          <div className={styles.top}>
            <div>
              <div className={styles.name}>{e.name}</div>
              <div className={styles.meta}>
                {e.contact}
                {e.plot ? ` · ${e.plot}` : ''}
                {e.source ? ` · ${e.source}` : ''}
              </div>
            </div>
            <div className={styles.date}>{e.createdAt.slice(0, 10)}</div>
          </div>
          {e.types && (
            <div className={styles.chips}>
              {e.types.split(',').map((t) => (
                <span className={styles.chip} key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
          {e.details && <div className={styles.details}>{e.details}</div>}
          {e.follow && (
            <div className={styles.followRow}>
              Follow up: <span className={e.follow === 'Yes' ? styles.followYes : undefined}>{e.follow}</span>
              {e.followDate ? ` · ${e.followDate}` : ''}
            </div>
          )}
        </div>
      ))}
      {enquiries && enquiries.length === 0 && !isLoading && <p style={{ color: 'var(--muted)' }}>No enquiries logged yet.</p>}
    </div>
  );
}
