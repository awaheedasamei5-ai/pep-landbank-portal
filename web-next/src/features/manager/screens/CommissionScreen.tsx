import { useState } from 'react';
import { ghs, monthLabel, shiftMonth, today } from '../../../shared/lib/format';
import { useCompanyCommission } from '../../commission/hooks/useCompanyCommission';
import { useDownloadCommissionReport } from '../../commission/hooks/useCommissionReportPdf';
import styles from './CommissionScreen.module.css';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Port of mgrCommission() (index.html:25479-25501) -- defaults to LAST
// month (the one actually payable, on the 15th of the current month), not
// the current still-accruing one. CSV export out of scope for this pass.
export function CommissionScreen() {
  const [monthKey, setMonthKey] = useState(() => shiftMonth(today().slice(0, 7), -1));
  const { data, isLoading } = useCompanyCommission(monthKey);
  const downloadPdf = useDownloadCommissionReport();
  const payoutDate = `${shiftMonth(monthKey, 1)}-15`;
  const sortedRows = data ? [...data.rows].sort((a, b) => b.total - a.total) : [];

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>Management</div>
      <h1 className={styles.title}>Commission</h1>
      <p className={styles.sub}>Personal + pool, paid on the 15th of the following month</p>

      <div className={styles.navCard}>
        <button type="button" className={styles.navBtn} onClick={() => setMonthKey((mk) => shiftMonth(mk, -1))}>
          &larr; Prev
        </button>
        <div className={styles.navLabel}>{monthLabel(monthKey)}</div>
        <button type="button" className={styles.navBtn} onClick={() => setMonthKey((mk) => shiftMonth(mk, 1))}>
          Next &rarr;
        </button>
      </div>
      <p className={styles.payable}>Payable {payoutDate}</p>

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}

      {data && (
        <>
          <button type="button" className={styles.downloadBtn} disabled={downloadPdf.isPending} onClick={() => downloadPdf.mutate(data)}>
            {downloadPdf.isPending ? 'Generating…' : '⬇ Download PDF report'}
          </button>

          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Pool total</div>
              <div className={styles.kpiValGold}>{ghs(data.poolTotal)}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Eligible agents</div>
              <div className={styles.kpiVal}>{data.eligibleCount}</div>
            </div>
          </div>
          <p className={styles.poolNote}>
            {data.totalNewPlotsThisMonth} new plot{data.totalNewPlotsThisMonth === 1 ? '' : 's'} sold this month &middot; {ghs(data.poolShare)} pool share each
          </p>

          <div className={styles.sectitle}>By agent</div>
          <div className={styles.list}>
            {sortedRows.map((r) => (
              <div className={styles.row} key={r.key}>
                <div className={styles.rowTop}>
                  <span className={styles.avatar}>{initials(r.name)}</span>
                  <div className={styles.rowMain}>
                    <div className={styles.name}>{r.name}</div>
                    <div className={styles.meta}>
                      {r.newPlotsThisMonth} new plot{r.newPlotsThisMonth === 1 ? '' : 's'} this month
                    </div>
                  </div>
                  <div className={styles.right}>
                    <div className={styles.amt}>{ghs(r.total)}</div>
                    <div className={styles.amtLabel}>total</div>
                  </div>
                </div>
                <div className={styles.tagRow}>
                  <span className={styles.tagGhost}>Personal {ghs(r.personal)}</span>
                  <span className={r.eligible ? styles.tagOk : styles.tagOff}>{r.eligible ? `Pool ${ghs(r.poolShare)}` : 'Pool: 3 months no sale'}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
