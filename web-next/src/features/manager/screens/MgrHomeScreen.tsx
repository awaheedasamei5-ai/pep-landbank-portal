import { useNavigate } from 'react-router';
import { ghs, today } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import { AreaChart } from '../../../shared/ui/AreaChart';
import { DonutChart } from '../../../shared/ui/DonutChart';
import { displayStageCode } from '../../pipeline/lib/pipelineLogic';
import { useManagerOverview } from '../hooks/useManagerOverview';
import styles from './MgrHomeScreen.module.css';

const HEAD_LINKS: { key: string; label: string; icon: IconName; path: string }[] = [
  { key: 'leaderboard', label: 'Leaderboard', icon: 'trophy', path: '/app/mgr/leaderboard' },
  { key: 'commission', label: 'Commission', icon: 'wallet', path: '/app/mgr/commission' },
  { key: 'settings', label: 'Settings', icon: 'settings', path: '/app/mgr/settings' },
  { key: 'analytics', label: 'Analytics', icon: 'chartLine', path: '/app/mgr/analytics' },
  { key: 'reports', label: 'Reports', icon: 'barChart', path: '/app/mgr/reports' },
  { key: 'datacheck', label: 'Data Check', icon: 'check', path: '/app/data-check' },
];

// A deliberate progression, not arbitrary category colors -- cool/faint
// for a brand-new lead, warming toward the app's own gold accent as a
// deal nears close, success green once it's actually closed. Pulled from
// this app's own token palette (tokens.css), not a generic chart-library
// default set.
const STAGE_COLORS: Record<string, string> = { '1': 'var(--c-faint)', '2A': 'var(--c-info)', '2B': '#3D6FA8', '3': 'var(--c-accent)', '4': 'var(--c-success)', Lost: 'var(--c-danger)' };

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function trailingMonthLabels(): string[] {
  const [y, m] = today().slice(0, 7).split('-').map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(y, m - 1 - (5 - i), 1);
    return d.toLocaleDateString('en-GB', { month: 'short' });
  });
}

// Company-wide dashboard -- confirmed live (Manager Overview research,
// 2026-08-29) that a real manager-role session gets unrestricted SELECT
// on leads/payments/complaints via RLS itself, so this is a real
// unfiltered aggregation, not a client-side illusion. Deliberately scoped
// to the highest-value slice of index.html's much larger mgrOverview()
// (banner slideshow, team streak grid, ops-today day-grid across all
// staff, and the companion/action-center insight carousel are all
// out of scope for this first cut) -- KPIs, pipeline-by-stage, and
// per-agent breakdown, the numbers a manager actually opens this screen
// to check first.
export function MgrHomeScreen() {
  const navigate = useNavigate();
  const { data, isLoading } = useManagerOverview();

  const maxAgentValue = Math.max(1, ...(data?.byAgent.map((a) => a.value) ?? [1]));
  const trend = data?.collectedTrend ?? [];
  const trendDelta = trend.length >= 2 ? trend[trend.length - 1] - trend[trend.length - 2] : null;
  const monthLabels = trailingMonthLabels();

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <div>
          <h1 className={styles.title}>Manager Home</h1>
          <p className={styles.sub}>Live across every agent</p>
        </div>
        <div className={styles.toolbar}>
          {HEAD_LINKS.map((l) => (
            <button key={l.key} type="button" className={styles.toolbarBtn} title={l.label} aria-label={l.label} onClick={() => navigate(l.path)}>
              <Icon name={l.icon} size={17} />
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {data && (
        <>
          <div className={styles.pillsWrap}>
            <PipePillStrip>
              <PipePill tone="blue" value={data.totalLeads} label="Total leads" />
              <PipePill tone="gold" value={ghs(data.outstanding)} label="Outstanding" isMoney />
              <PipePill tone="green" value={data.fullyPaidCount} label="Fully paid" />
              <PipePill tone="red" value={data.openComplaints} label="Open complaints" />
            </PipePillStrip>
          </div>

          <div className={styles.heroCard}>
            <div className={styles.heroTop}>
              <div>
                <div className={styles.heroLabel}>Collected this month</div>
                <div className={styles.heroValue}>{ghs(data.collected)}</div>
              </div>
              {trendDelta !== null && trendDelta !== 0 && (
                <span className={`${styles.heroDelta} ${trendDelta > 0 ? styles.heroDeltaUp : styles.heroDeltaDown}`}>
                  {trendDelta > 0 ? '▲' : '▼'} {ghs(Math.abs(trendDelta))} vs last month
                </span>
              )}
            </div>
            <div className={styles.heroChart}>
              <AreaChart values={trend} labels={monthLabels} color="var(--c-accent-soft)" height={90} />
            </div>
            <div className={styles.heroFootRow}>
              <div>
                <div className={styles.heroFootVal}>{ghs(data.pipelineValue)}</div>
                <div className={styles.heroFootLbl}>Pipeline value</div>
              </div>
              <div>
                <div className={styles.heroFootVal}>{data.siteVisitsCount}</div>
                <div className={styles.heroFootLbl}>Site visits logged</div>
              </div>
            </div>
          </div>

          <div className={styles.sectitle}>Pipeline by stage</div>
          <div className={`${styles.card} ${styles.donutCard}`}>
            <DonutChart segments={data.stageFunnel.map((s) => ({ key: s.stage, label: s.stage === 'Lost' ? 'Lost' : displayStageCode(s.stage), value: s.count, color: STAGE_COLORS[s.stage] ?? '#94A3B8' }))} centerValue={String(data.stageFunnel.reduce((sum, s) => sum + s.count, 0))} centerLabel="leads" />
            <div className={styles.legend}>
              {data.stageFunnel.map((s) => (
                <button type="button" className={styles.legendRow} key={s.stage} onClick={() => navigate(`/app/mgr/pipeline?stage=${encodeURIComponent(s.stage)}`)}>
                  <span className={styles.legendDot} style={{ background: STAGE_COLORS[s.stage] ?? '#94A3B8' }} />
                  <span className={styles.legendLabel}>{s.stage === 'Lost' ? 'Lost' : displayStageCode(s.stage)}</span>
                  <span className={styles.legendValue}>{s.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.sectitle}>By agent</div>
          <div className={styles.card}>
            {data.byAgent.length === 0 && <p style={{ color: 'var(--c-muted)', margin: 0 }}>No leads yet.</p>}
            {data.byAgent.map((a) => (
              <button type="button" className={styles.agentRow} key={a.key} onClick={() => navigate(`/app/mgr/pipeline?agent=${encodeURIComponent(a.key)}`)}>
                <span className={styles.agentAvatar}>{initials(a.name)}</span>
                <div className={styles.agentMain}>
                  <div className={styles.agentTopLine}>
                    <span className={styles.agentName}>{a.name}</span>
                    <span className={styles.agentValue}>{ghs(a.value)}</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${Math.max(4, Math.round((a.value / maxAgentValue) * 100))}%`, background: 'linear-gradient(90deg, var(--c-accent-soft), var(--c-accent))' }} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
