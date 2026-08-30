import { useNavigate } from 'react-router';
import { Icon } from '../../../shared/ui/Icon';
import { useSmartInsights } from '../hooks/useSmartInsights';
import styles from './SmartInsightsScreen.module.css';

// Port of index.html's renderSmartInsights() as its own destination
// screen (index.html:9977-9985) -- previously only ever embedded inline
// on Home/Manager Home/the Action Center companion widget. This is the
// full-screen "View all" destination those previews link out to,
// reachable from More (both roles) and the Insights Hub (manager).
export function SmartInsightsScreen() {
  const navigate = useNavigate();
  const { insights, isLoading } = useSmartInsights();

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>Smart Insights</div>
      <h1 className={styles.title}>Auto-generated from your live data</h1>
      <p className={styles.sub}>Re-scans every time you open this — nothing to configure, nothing to snooze.</p>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      <div className={styles.grid}>
        {insights.map((i) => (
          <button key={i.key} type="button" className={`${styles.card} ${styles[i.tone]}`} disabled={!i.kind} onClick={() => i.kind && navigate(`/app/insights/${i.kind}`)}>
            <span className={styles.iconBubble}>
              <Icon name={i.icon} size={18} />
            </span>
            <div className={styles.cardBody}>
              <div className={styles.cardText}>{i.text}</div>
              {i.detail && <div className={styles.cardDetail}>{i.detail}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
