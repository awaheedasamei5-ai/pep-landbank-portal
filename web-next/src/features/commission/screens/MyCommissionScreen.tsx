import { ghs, monthLabel, today } from '../../../shared/lib/format';
import { useMyCommission } from '../hooks/useMyCommission';
import styles from './MyCommissionScreen.module.css';

// Port of viewMyCommission() (index.html:25443-25455) -- always the current
// month, personal-only (pool share depends on every other agent's data,
// which only Management's session can correctly total). Deliberately no
// "raise a concern" messaging integration in this first cut -- that would
// need this screen to know the real manager's staff key rather than a
// hardcoded guess, out of scope here.
export function MyCommissionScreen() {
  const monthKey = today().slice(0, 7);
  const { data, isLoading } = useMyCommission(monthKey);

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>My commission</div>
      <h1 className={styles.total}>{ghs(data?.total ?? 0)}</h1>
      <p className={styles.sub}>{monthLabel(monthKey)} &middot; personal only, pool share confirmed by Management on the 15th</p>

      <div className={styles.sectitle}>Which plots earned this</div>
      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {data && data.rows.length === 0 && !isLoading && <p style={{ color: 'var(--muted)' }}>Nothing counted yet this month. Commission is calculated from approved payments logged this month against your clients.</p>}
      <div className={styles.list}>
        {data?.rows.map((r) => (
          <div className={styles.row} key={`${r.leadId}-${r.paymentDate}`}>
            <div>
              <div className={styles.name}>{r.clientName}</div>
              <div className={styles.meta}>
                {r.plotType} &middot; paid {ghs(r.paymentAmount)} on {r.paymentDate}
              </div>
            </div>
            <div className={styles.right}>
              <div className={styles.amt}>{ghs(r.contribution)}</div>
              <div className={styles.amtLabel}>commission</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
