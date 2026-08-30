import { useNavigate } from 'react-router';
import { ghs } from '../../../shared/lib/format';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { TileGrid, type TileItem } from '../../../shared/ui/TileGrid';
import { useManagerOverview } from '../hooks/useManagerOverview';
import { useDataCheck } from '../../data-check/hooks/useDataCheck';
import styles from './InsightsHubScreen.module.css';

// Port of index.html's Insights Hub (viewInsightsHub, index.html:9045-
// 9057) -- "the sidebar's Insights/Management top-level items land
// here... consolidates" what used to be scattered destinations into one
// screen. index.html's own tile set was ['Analytics','Reports',
// 'Management Reports','Report Archive','Insights','Commission'] --
// 'Management Reports' is folded into Reports here (same merge this
// session already made on that screen itself), 'Insights' (the rule-
// based Smart Insights nudge screen) and 'Report Archive' both stay out
// -- neither exists as a standalone screen in web-next yet. Data Check
// and Staff Report are added since they're real manager insight/
// reporting surfaces this session built that legacy's own More screen
// grouped under "Insights & data" anyway.
//
// Genuinely more than a nav shell: the KPI strip reuses the same live
// queries Manager Home and Data Check already run (shared TanStack Query
// cache keys), so this doubles as a real "morning glance" -- not
// synthetic, not a second data source to keep in sync.
export function InsightsHubScreen() {
  const navigate = useNavigate();
  const { data: overview } = useManagerOverview();
  const { hygieneScore, issues, isLoading: dataCheckLoading } = useDataCheck();

  const trend = overview?.collectedTrend ?? [];
  const revenueThisMonth = trend[trend.length - 1] ?? 0;

  const items: TileItem[] = [
    { key: 'analytics', label: 'Analytics', sub: 'Live company performance dashboard', color: 'blue', icon: 'chartLine', onOpen: () => navigate('/app/mgr/analytics') },
    { key: 'reports', label: 'Reports', sub: 'CSV/Excel exports & Management Report PDF', color: 'green', icon: 'barChart', onOpen: () => navigate('/app/mgr/reports') },
    { key: 'datacheck', label: 'Data Check', sub: 'Pricing/payment inconsistencies, company-wide', color: 'orange', icon: 'check', onOpen: () => navigate('/app/data-check') },
    { key: 'staffreport', label: 'Staff Report', sub: 'One staff member, or compare everyone', color: 'purple', icon: 'team', onOpen: () => navigate('/app/office/staffreport') },
    { key: 'commission', label: 'Commission', sub: "This month's pool & per-agent breakdown", color: 'teal', icon: 'wallet', onOpen: () => navigate('/app/mgr/commission') },
    { key: 'insights', label: 'Smart Insights', sub: 'Proactive nudges, auto-generated company-wide', color: 'red', icon: 'warning', onOpen: () => navigate('/app/insights') },
  ];

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>Manager</div>
      <h1 className={styles.title}>Insights</h1>
      <p className={styles.sub}>Analytics, reports and company-wide performance — everything in one place.</p>

      <div className={styles.pillsWrap}>
        <PipePillStrip>
          <PipePill tone="blue" value={ghs(revenueThisMonth)} label="Revenue this month" isMoney trend={trend} />
          <PipePill tone="gold" value={ghs(overview?.outstanding ?? 0)} label="Outstanding" isMoney />
          <PipePill tone={hygieneScore < 90 ? 'red' : 'green'} value={dataCheckLoading ? '…' : `${hygieneScore}%`} label="Data hygiene" />
        </PipePillStrip>
      </div>
      {!dataCheckLoading && issues.length > 0 && (
        <button type="button" className={styles.hygieneLink} onClick={() => navigate('/app/data-check')}>
          {issues.length} thing{issues.length === 1 ? '' : 's'} worth reviewing in Data Check →
        </button>
      )}

      <div className={styles.sectitle}>Explore</div>
      <TileGrid items={items} />
    </div>
  );
}
