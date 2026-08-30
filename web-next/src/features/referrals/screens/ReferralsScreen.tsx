import { useNavigate } from 'react-router';
import { useReferrals } from '../hooks/useReferrals';
import styles from './ReferralsScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Deliberately no "mark cleared"/payout action anywhere on this screen --
// see the Referral type's comment in types/domain.ts for the real, still-
// live RLS gap this is working around (a raw UPDATE can bypass the one
// safe clear_referral() RPC). This is a read + create screen only.
export function ReferralsScreen() {
  const navigate = useNavigate();
  const { data: referrals, isLoading } = useReferrals();

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Referrals</h1>
          <p className={styles.sub}>{referrals?.length ?? 0} recorded</p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => navigate('/app/sales/referrals/new')}>
          + Add referral
        </button>
      </div>

      {isLoading && <p className={styles.emptyMsg}>Loading…</p>}
      {referrals?.map((r) => (
        <div className={styles.row} key={r.id}>
          <span className={styles.avatar}>{initials(r.referredName)}</span>
          <div className={styles.rowMain}>
            <div className={styles.name}>
              {r.referrerName}
              <span className={styles.arrow}>→</span>
              {r.referredName}
            </div>
            <div className={styles.meta}>
              {r.referredContact}
              {r.referredLocation ? ` · ${r.referredLocation}` : ''}
            </div>
          </div>
          <div className={styles.right}>
            <span className={`${styles.status} ${r.status === 'Cleared' ? styles.statusCleared : styles.statusPending}`}>{r.status}</span>
            {r.pointsAwarded > 0 && <div className={styles.points}>{r.pointsAwarded} pts</div>}
          </div>
        </div>
      ))}
      {referrals && referrals.length === 0 && !isLoading && <p className={styles.emptyMsg}>No referrals recorded yet.</p>}
    </div>
  );
}
