import { DonutChart } from '../../../shared/ui/DonutChart';
import type { MonthStats } from '../lib/attendanceRosterLogic';
import styles from './MonthKpiCard.module.css';

// ATTENDANCE_BLUEPRINT.md §4 -- reuses the existing DonutChart as a single-
// value progress ring (two segments: on-time days colored, the remainder
// transparent so only the track shows through) rather than building a
// bespoke ring component from scratch.
export function MonthKpiCard({ stats }: { stats: MonthStats }) {
  const ringColor = stats.isOnTrack ? 'var(--c-success)' : 'var(--c-warn)';
  const pct = Math.round(stats.onTimeRate * 100);

  return (
    <div className={styles.card}>
      <div className={styles.headRow}>
        <h3 className={styles.title}>This month</h3>
        <span className={`${styles.pill} ${stats.isOnTrack ? styles.onTrack : styles.atRisk}`}>{stats.isOnTrack ? '● On track' : '● At risk'}</span>
      </div>

      <div className={styles.body}>
        <DonutChart
          size={80}
          thickness={9}
          centerValue={`${pct}%`}
          segments={[
            { key: 'onTime', label: 'On time', value: stats.onTimeDays, color: ringColor },
            { key: 'rest', label: '', value: Math.max(stats.daysAttended - stats.onTimeDays, 0), color: 'transparent' },
          ]}
        />
        <div className={styles.bodyText}>
          <span className={styles.bodyLabel}>On-time rate</span>
          <span className={styles.bodySub}>
            {stats.onTimeDays} of {stats.daysAttended} day(s) present were on time
          </span>
        </div>
      </div>

      <div className={styles.tileGrid}>
        <div className={`${styles.tile} ${styles.tile_present}`}>
          <div className={styles.tileCount}>{stats.daysAttended}</div>
          <div className={styles.tileLabel}>Days present</div>
        </div>
        <div className={`${styles.tile} ${styles.tile_absent}`}>
          <div className={styles.tileCount}>{stats.absences}</div>
          <div className={styles.tileLabel}>Absences</div>
        </div>
        <div className={`${styles.tile} ${styles.tile_leave}`}>
          <div className={styles.tileCount}>{stats.onLeave}</div>
          <div className={styles.tileLabel}>On leave</div>
        </div>
      </div>
    </div>
  );
}
