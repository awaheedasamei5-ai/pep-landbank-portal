import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { AreaChart } from '../../../shared/ui/AreaChart';
import { DonutChart } from '../../../shared/ui/DonutChart';
import { useAnalytics } from '../hooks/useAnalytics';
import styles from './AnalyticsScreen.module.css';

const METHOD_COLORS = ['var(--c-accent)', 'var(--c-info)', 'var(--c-success)', '#3D6FA8', 'var(--c-warn)', '#94A3B8', '#B45309'];

function trailingMonthLabels(): string[] {
  const d = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(d.getFullYear(), d.getMonth() - (5 - i), 1);
    return dt.toLocaleDateString('en-GB', { month: 'short' });
  });
}

// Port of index.html's mgrAnalytics() -- see useAnalytics.ts's own
// comment for exactly what's reused vs newly built vs deliberately out
// of scope (net position).
export function AnalyticsScreen() {
  const navigate = useNavigate();
  const { isLoading, monthLabel, revenueThisMonth, outstanding, fullyPaidCount, revenueTrend, composition, methodBreakdown, topAgents } = useAnalytics();
  const monthLabels = trailingMonthLabels();

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>Analytics</div>
      <h1 className={styles.title}>Company performance at a glance</h1>
      <p className={styles.sub}>{monthLabel}</p>

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}

      {!isLoading && (
        <>
          <div className={styles.pillsWrap}>
            <PipePillStrip>
              <PipePill tone="blue" value={ghs(revenueThisMonth)} label="Revenue this month" isMoney trend={revenueTrend} />
              <PipePill tone="gold" value={ghs(outstanding)} label="Outstanding" isMoney />
              <PipePill tone="green" value={fullyPaidCount} label="Fully paid" />
            </PipePillStrip>
          </div>

          <div className={styles.sectitle}>Revenue trend</div>
          <p className={styles.sectitleHint}>last 6 months, all agents</p>
          <div className={styles.card}>
            <AreaChart values={revenueTrend} labels={monthLabels} color="var(--c-accent-soft)" height={90} />
          </div>

          <div className={styles.sectitle}>Pipeline composition</div>
          {composition && <p className={styles.sectitleHint}>{composition.activeCount} active leads · {ghs(composition.totalVal)}</p>}
          <div className={`${styles.card} ${styles.chartCard}`}>
            {composition && composition.totalVal > 0 ? (
              <>
                <DonutChart
                  segments={[
                    { key: 'committed', label: 'Committed (paying)', value: composition.committedVal, color: 'var(--c-success)' },
                    { key: 'prospect', label: 'Prospects (unpaid)', value: composition.prospectVal, color: '#94A3B8' },
                  ]}
                  size={110}
                />
                <div className={styles.legend}>
                  <LegendRow color="var(--c-success)" label="Committed (paying)" value={`${ghs(composition.committedVal)} · ${composition.committedPct}%`} />
                  <LegendRow color="#94A3B8" label="Prospects (unpaid)" value={`${ghs(composition.prospectVal)} · ${composition.prospectPct}%`} />
                  <div className={styles.healthLabel}>{composition.healthLabel}</div>
                </div>
              </>
            ) : (
              <p className={styles.emptyMsg}>No active pipeline yet.</p>
            )}
          </div>

          <div className={styles.sectitle}>Payments by method</div>
          <p className={styles.sectitleHint}>{monthLabel}</p>
          <div className={`${styles.card} ${styles.chartCard}`}>
            {methodBreakdown.length > 0 ? (
              <>
                <DonutChart segments={methodBreakdown.map((m, i) => ({ key: m.method, label: m.method, value: m.total, color: METHOD_COLORS[i % METHOD_COLORS.length] }))} size={110} />
                <div className={styles.legend}>
                  {methodBreakdown.map((m, i) => (
                    <LegendRow key={m.method} color={METHOD_COLORS[i % METHOD_COLORS.length]} label={m.method} value={ghs(m.total)} />
                  ))}
                </div>
              </>
            ) : (
              <p className={styles.emptyMsg}>No payments recorded yet this month.</p>
            )}
          </div>

          <div className={styles.sectitle}>Top agents</div>
          <p className={styles.sectitleHint}>by revenue collected, {monthLabel}</p>
          <div className={styles.card}>
            {topAgents.length === 0 && <p className={styles.emptyMsg}>No agent activity this month.</p>}
            {topAgents.map((a, i) => (
              <div key={a.key} className={styles.agentRow}>
                <div className={styles.agentLeft}>
                  <span className={styles.rank}>{i + 1}</span>
                  <div>
                    <div className={styles.agentName}>{a.name}</div>
                    <div className={styles.agentMeta}>
                      {a.newLeads} new lead{a.newLeads === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <div className={styles.agentValue}>{ghs(a.revenue)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className={styles.legendRow}>
      <span className={styles.legendDot} style={{ background: color }} />
      <span className={styles.legendLabel}>{label}</span>
      <span className={styles.legendValue}>{value}</span>
    </div>
  );
}
