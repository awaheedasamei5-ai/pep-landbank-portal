import { useState } from 'react';
import { ghs } from '../../../shared/lib/format';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { computeQuotationTotals, type PaymentPlanKey } from '../lib/quotationLogic';
import type { PlotType } from '../../../types/domain';
import styles from './QuotationScreen.module.css';

const PLOT_TYPES: PlotType[] = ['Full Plot', 'Half Plot'];
const PLANS: PaymentPlanKey[] = ['Full Payment', '3 Months', '6 Months', '9 Months', '12 Months'];

// Standard Quotation calculator only -- port of computeQuotationTotals()
// (index.html:16603-16614). Technical Quotation (custom/irregular lots by
// area) and actually generating a client-facing PDF (index.html's
// buildQuotationPDF, a long branded document template) are both
// deliberately out of scope -- this shows the live breakdown on screen,
// the number every quotation flavor and both PDF templates are ultimately
// built from. Open to any signed-in staff member (real config.get() RLS
// is `auth.uid() IS NOT NULL`, not manager-gated), matching how
// index.html's Quotation tile has no role restriction either.
export function QuotationScreen() {
  const { data: config, isLoading } = useConfig();
  const [plotType, setPlotType] = useState<PlotType>('Full Plot');
  const [noPlots, setNoPlots] = useState(1);
  const [plan, setPlan] = useState<PaymentPlanKey>('12 Months');

  const totals = config ? computeQuotationTotals(config, plotType, noPlots, plan) : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>Standard Quotation</div>
      <h1 className={styles.title}>Quotation calculator</h1>
      <p className={styles.sub}>Live pricing &mdash; nothing saved, nothing sent. Full or Half Plot(s) at the standard list price.</p>

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}

      <div className={styles.card}>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Plot type</label>
            <select className={styles.select} value={plotType} onChange={(e) => setPlotType(e.target.value as PlotType)}>
              {PLOT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>No. of plots</label>
            <input className={styles.input} type="number" min={1} step={1} value={noPlots} onChange={(e) => setNoPlots(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Payment plan</label>
          <select className={styles.select} value={plan} onChange={(e) => setPlan(e.target.value as PaymentPlanKey)}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {totals && (
        <>
          <div className={styles.card}>
            <SummaryRow label="List total" value={ghs(totals.listTotal)} />
            {totals.discountTotal > 0 && <SummaryRow label="Discount" value={`-${ghs(totals.discountTotal)}`} />}
            <SummaryRow label="Net price" value={ghs(totals.net)} />
            {totals.interestTotal > 0 && <SummaryRow label={`Interest (${plan})`} value={ghs(totals.interestTotal)} />}
            <SummaryRow label="Grand total" value={ghs(totals.grand)} strong />
          </div>

          {totals.planMonths > 0 ? (
            <>
              <div className={styles.card}>
                <SummaryRow label="Deposit (30% of net)" value={ghs(totals.deposit)} />
                <SummaryRow label="Balance after deposit" value={ghs(totals.balance)} />
                <SummaryRow label={`Monthly due (${totals.planMonths} months)`} value={ghs(totals.monthlyDue)} strong />
              </div>

              <div className={styles.sectitle}>Payment schedule</div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Opening</th>
                      <th>Payment</th>
                      <th>Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.schedule.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{ghs(row.opening)}</td>
                        <td>{ghs(row.payment)}</td>
                        <td>{ghs(row.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className={styles.fullPaymentNote}>Full Payment &mdash; the whole grand total is due at once, no installment schedule.</p>
          )}
        </>
      )}
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={strong ? styles.summaryValStrong : styles.summaryVal}>{value}</span>
    </div>
  );
}
