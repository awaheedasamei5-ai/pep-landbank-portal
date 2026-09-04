import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { usePipelineSummary } from '../../pipeline/hooks/usePipelineSummary';
import { useTodayStreak } from '../../streak/hooks/useTodayStreak';
import { StreakCard, StreakCardSkeleton } from '../../streak/components/StreakCard';
import { HeroCard } from '../components/HeroCard';
import { TodayTasksCard } from '../components/TodayTasksCard';
import { useMyCommission } from '../../commission/hooks/useMyCommission';
import { useMyCollectedTrend } from '../hooks/useMyCollectedTrend';
import { useSmartInsights } from '../../smart-insights/hooks/useSmartInsights';
import { CompanionPanel } from '../../companion/components/CompanionPanel';
import { PipePill, PipePillStrip } from '../../../shared/ui/PipePill';
import { AreaChart } from '../../../shared/ui/AreaChart';
import { ghs, today } from '../../../shared/lib/format';
import styles from './HomeScreen.module.css';

function trailingMonthLabels(): string[] {
  const [y, m] = today().slice(0, 7).split('-').map(Number);
  return Array.from({ length: 6 }, (_, i) => new Date(y, m - 1 - (5 - i), 1).toLocaleDateString('en-GB', { month: 'short' }));
}

// Same "real dashboard, not a stacked list" treatment given to Manager
// Home -- a KPI pill strip and a hero collected-trend chart, using this
// agent's own real data (useMyCollectedTrend mirrors ManagerOverview.
// collectedTrend exactly, just scoped to one agent's payments).
export function HomeScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const pipeline = usePipelineSummary();
  const streak = useTodayStreak();
  const commission = useMyCommission(today().slice(0, 7));
  const trend = useMyCollectedTrend();
  const smartInsights = useSmartInsights();

  const firstName = profile?.name.split(' ')[0] ?? '';
  const series = trend.data ?? [];
  const trendDelta = series.length >= 2 ? series[series.length - 1] - series[series.length - 2] : null;

  return (
    <div className={styles.wrap}>
      <HeroCard greetName={firstName} pipelineValue={pipeline.data?.pipelineValue ?? 0} myCommission={commission.data?.total} onCommissionClick={() => navigate('/app/commission')}>
        {streak.data ? <StreakCard streak={streak.data} /> : streak.isLoading ? <StreakCardSkeleton /> : null}
      </HeroCard>

      <div className={styles.pillsWrap}>
        <PipePillStrip>
          <PipePill tone="blue" value={pipeline.data?.leadCount ?? 0} label="My leads" />
          <PipePill tone="gold" value={ghs(commission.data?.total ?? 0)} label="Commission (this month)" isMoney />
        </PipePillStrip>
      </div>

      {series.some((v) => v > 0) && (
        <div className={styles.heroCard}>
          <div className={styles.heroTop}>
            <div>
              <div className={styles.heroLabel}>Collected this month</div>
              <div className={styles.heroValue}>{ghs(series[series.length - 1] ?? 0)}</div>
            </div>
            {trendDelta !== null && trendDelta !== 0 && (
              <span className={`${styles.heroDelta} ${trendDelta > 0 ? styles.heroDeltaUp : styles.heroDeltaDown}`}>
                {trendDelta > 0 ? '▲' : '▼'} {ghs(Math.abs(trendDelta))}
              </span>
            )}
          </div>
          <div className={styles.heroChart}>
            <AreaChart values={series} labels={trailingMonthLabels()} color="var(--c-accent-soft)" height={72} />
          </div>
        </div>
      )}

      <TodayTasksCard />

      {smartInsights.leads.length > 0 && <CompanionPanel leads={smartInsights.leads} collectedTrend={series} leadCount={pipeline.data?.leadCount ?? 0} pipelineValue={pipeline.data?.pipelineValue ?? 0} />}
    </div>
  );
}
