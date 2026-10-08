import styles from './LeaveBalanceRing.module.css';

// A real circular progress ring -- remaining/total as one continuous
// arc, days remaining centered.
//
// `reserved` and `confirmedUsed` are deliberately two different numbers
// (Plan Part 1): reserved is every planned/pending/approved day
// protecting the annual cap the moment it's requested; confirmedUsed is
// only days that have actually passed AND the staff member confirmed
// they took (see leaveLogic.ts's leaveDaysReserved/leaveDaysConfirmedUsed).
// The ring itself still tracks remaining-of-total (the entitlement, which
// reads off reserved) -- confirmedUsed is a separate real stat, not the
// same number relabeled.
export function LeaveBalanceRing({ total, reserved, remaining, confirmedUsed, year }: { total: number; reserved: number; remaining: number; confirmedUsed: number; year: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const offset = c * (1 - frac);

  return (
    <div className={styles.wrap}>
      <div className={styles.ringBox}>
        <svg viewBox="0 0 100 100" className={styles.svg}>
          <circle className={styles.track} cx="50" cy="50" r={r} strokeWidth="9" />
          <circle className={styles.fill} cx="50" cy="50" r={r} strokeWidth="9" strokeDasharray={c} strokeDashoffset={offset} />
        </svg>
        <div className={styles.center}>
          <div className={styles.value}>{remaining}</div>
          <div className={styles.unit}>left</div>
        </div>
      </div>
      <div className={styles.stats}>
        <div className={styles.statRow}>
          <span className={styles.statVal}>{total}</span>
          <span className={styles.statLabel}>days/yr</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statVal}>{reserved}</span>
          <span className={styles.statLabel}>reserved in {year}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statVal}>{confirmedUsed}</span>
          <span className={styles.statLabel}>confirmed used</span>
        </div>
      </div>
    </div>
  );
}
