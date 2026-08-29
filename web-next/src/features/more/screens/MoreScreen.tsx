import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { demoReset } from '../../../data/demo/store';
import styles from './MoreScreen.module.css';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// A genuine gap this fills, not a cosmetic add: useSessionStore.logout()
// has existed since Phase 1 but nothing in the app ever called it -- there
// was no way to actually sign out. Demo data reset was similarly only
// reachable via clearing localStorage by hand.
export function MoreScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const logout = useSessionStore((s) => s.logout);
  const [confirmingReset, setConfirmingReset] = useState(false);

  function handleResetClick() {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    demoReset();
    // A full reload is the simplest reliable way to reflect a reset that
    // touches every resource at once -- reaching into every feature's
    // TanStack Query cache to invalidate it individually would be far
    // more fragile than just reloading, for an action this rare.
    window.location.reload();
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  if (!profile) return null;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>More</h1>

      <div className={styles.profileCard}>
        <div className={styles.avatar}>{initials(profile.name)}</div>
        <div>
          <div className={styles.name}>{profile.name}</div>
          <div className={styles.meta}>{profile.key}</div>
          <span className={styles.roleBadge}>{profile.role === 'manager' ? 'Management' : 'Agent'}</span>
        </div>
      </div>

      <div className={styles.sectionTitle}>App</div>
      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>Data source</div>
            <div className={styles.rowSub}>Where this app is reading and writing</div>
          </div>
          {demoMode && <span className={`${styles.pill} ${styles.pillDemo}`}>Demo mode</span>}
        </div>
        {demoMode && (
          <div className={styles.row}>
            <div>
              <div className={styles.rowLabel}>Reset demo data</div>
              <div className={styles.rowSub}>Wipes your local demo changes, reseeds the sample data</div>
            </div>
            <button type="button" className={`${styles.actionBtn} ${confirmingReset ? styles.warn : ''}`} onClick={handleResetClick}>
              {confirmingReset ? 'Confirm reset' : 'Reset'}
            </button>
          </div>
        )}
      </div>

      <div className={styles.sectionTitle}>Account</div>
      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>Sign out</div>
            <div className={styles.rowSub}>You'll need to pick a role again to sign back in</div>
          </div>
          <button type="button" className={`${styles.actionBtn} ${styles.danger}`} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>

      <div className={styles.version}>Palmstead V2 -- web-next preview build</div>
    </div>
  );
}
