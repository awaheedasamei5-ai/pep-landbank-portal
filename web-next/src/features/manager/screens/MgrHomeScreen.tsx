import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { displayStageCode } from '../../pipeline/lib/pipelineLogic';
import { useManagerOverview } from '../hooks/useManagerOverview';
import styles from './MgrHomeScreen.module.css';

const STAGE_COLORS: Record<string, string> = { '1': '#94A3B8', '2A': '#64748B', '2B': '#3B82F6', '3': '#F59E0B', '4': 'var(--ok)', Lost: '#EF4444' };

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

  const maxStageCount = Math.max(1, ...(data?.stageFunnel.map((s) => s.count) ?? [1]));
  const maxAgentValue = Math.max(1, ...(data?.byAgent.map((a) => a.value) ?? [1]));

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <div>
          <h1 className={styles.title}>Manager Home</h1>
          <p className={styles.sub}>Live across every agent</p>
        </div>
        <div className={styles.headBtns}>
          <button type="button" className={styles.leaderboardBtn} onClick={() => navigate('/app/mgr/leaderboard')}>
            🏆 Leaderboard
          </button>
          <button type="button" className={styles.leaderboardBtn} onClick={() => navigate('/app/mgr/commission')}>
            💰 Commission
          </button>
          <button type="button" className={styles.leaderboardBtn} onClick={() => navigate('/app/mgr/settings')}>
            ⚙ Settings
          </button>
          <button type="button" className={styles.leaderboardBtn} onClick={() => navigate('/app/mgr/reports')}>
            📊 Reports
          </button>
        </div>
      </div>

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
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
          <div className={styles.pillsWrap}>
            <PipePillStrip>
              <PipePill tone="blue" value={ghs(data.pipelineValue)} label="Pipeline value" isMoney />
              <PipePill tone="green" value={ghs(data.collected)} label="Collected" isMoney />
              <PipePill tone="gold" value={data.siteVisitsCount} label="Site visits logged" />
            </PipePillStrip>
          </div>

          <div className={styles.sectitle}>Pipeline by stage</div>
          <div className={styles.card}>
            {data.stageFunnel.map((s) => (
              <div className={styles.barRow} key={s.stage}>
                <div className={styles.barLabel}>{s.stage === 'Lost' ? 'Lost' : displayStageCode(s.stage)}</div>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${s.count ? Math.max(4, Math.round((s.count / maxStageCount) * 100)) : 0}%`, background: STAGE_COLORS[s.stage] }} />
                </div>
                <div className={styles.barValue}>{s.count}</div>
              </div>
            ))}
          </div>

          <div className={styles.sectitle}>By agent</div>
          <div className={styles.card}>
            {data.byAgent.length === 0 && <p style={{ color: 'var(--muted)', margin: 0 }}>No leads yet.</p>}
            {data.byAgent.map((a) => (
              <div className={styles.barRow} key={a.key}>
                <div className={styles.barLabel}>{a.name}</div>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${Math.max(4, Math.round((a.value / maxAgentValue) * 100))}%`, background: 'linear-gradient(90deg, var(--leaf), var(--green))' }} />
                </div>
                <div className={styles.barValue}>{ghs(a.value)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
