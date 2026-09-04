import { ghs, monthLabel, shiftMonth, today } from '../../../shared/lib/format';
import { useMyCommission } from '../hooks/useMyCommission';
import { useCommissionExplainer } from '../hooks/useCommissionExplainer';
import styles from './MyCommissionScreen.module.css';

// Port of viewMyCommission() (index.html:25443-25455) -- always the current
// month, personal-only (pool share depends on every other agent's data,
// which only Management's session can correctly total). Deliberately no
// "raise a concern" messaging integration in this first cut -- that would
// need this screen to know the real manager's staff key rather than a
// hardcoded guess, out of scope here.
//
// The month-over-month delta chip is new for V2 -- adapted from a pattern
// studied on Figma (fintech line items pairing a value with an inline
// colored delta) during Phase 11 UI research. Applied at the header level
// against last month's total, not per payment row, since a single payment
// doesn't have a "previous value" to compare against -- forcing the pattern
// onto rows that don't naturally have one would have been the lazy version.
export function MyCommissionScreen() {
  const monthKey = today().slice(0, 7);
  const prevMonthKey = shiftMonth(monthKey, -1);
  const { data, isLoading } = useMyCommission(monthKey);
  const { data: prevData } = useMyCommission(prevMonthKey);
  const { data: explainer } = useCommissionExplainer(data, prevData?.total, monthLabel(monthKey));

  const delta = prevData && data ? data.total - prevData.total : null;
  const deltaPct = delta !== null && prevData && prevData.total > 0 ? Math.round((delta / prevData.total) * 100) : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>My commission</div>
      <div className={styles.totalRow}>
        <h1 className={styles.total}>{ghs(data?.total ?? 0)}</h1>
        {delta !== null && delta !== 0 && (
          <span className={`${styles.delta} ${delta > 0 ? styles.deltaUp : styles.deltaDown}`}>
            {delta > 0 ? '▲' : '▼'} {ghs(Math.abs(delta))}
            {deltaPct !== null && ` (${delta > 0 ? '+' : '-'}${Math.abs(deltaPct)}%)`}
          </span>
        )}
      </div>
      <p className={styles.sub}>
        {monthLabel(monthKey)} &middot; personal only, pool share confirmed by Management on the 15th
        {delta !== null && <> &middot; vs {ghs(prevData?.total ?? 0)} in {monthLabel(prevMonthKey)}</>}
      </p>

      {explainer && (
        <div className={styles.aiRow}>
          <span className={styles.aiBadge}>AI</span>
          <span>{explainer}</span>
        </div>
      )}

      <div className={styles.sectitle}>Which plots earned this</div>
      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {data && data.rows.length === 0 && !isLoading && <p style={{ color: 'var(--c-muted)' }}>Nothing counted yet this month. Commission is calculated from approved payments logged this month against your clients.</p>}
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
