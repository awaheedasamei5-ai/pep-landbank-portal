import { useAttendanceMonthComparison } from '../hooks/useAttendance';
import styles from './TeamComparisonCard.module.css';

interface TeamComparisonCardProps {
  staffKey: string;
  monthKey: string;
  cutoff: string;
}

// ATTENDANCE_BLUEPRINT.md §6. Only rendered for a staff (not manager)
// session -- see AttendanceTodayScreen. Sourced from the real
// get_attendance_month_comparison() RPC (see useAttendanceMonthComparison
// / source.ts), not a raw table read -- a regular staff session can't see
// anyone else's attendance_log rows under RLS.
export function TeamComparisonCard({ staffKey, monthKey, cutoff }: TeamComparisonCardProps) {
  const { data: rows } = useAttendanceMonthComparison(monthKey, cutoff);

  if (!rows || rows.length === 0) return null;

  const maxDays = Math.max(...rows.map((r) => r.daysAttended), 1);
  const myIndex = rows.findIndex((r) => r.staffKey === staffKey);
  const rankLine = myIndex >= 0 ? `You're #${myIndex + 1} of ${rows.length} for days attended` : 'This month';

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>You vs the team</h3>
      <p className={styles.rankLine}>{rankLine}</p>
      <div className={styles.rows}>
        {rows.map((r) => {
          const isYou = r.staffKey === staffKey;
          const pct = (r.daysAttended / maxDays) * 100;
          return (
            <div key={r.staffKey}>
              <div className={styles.rowMeta}>
                <span className={`${styles.rowName} ${isYou ? styles.rowNameYou : ''}`}>
                  {r.staffName}
                  {isYou ? ' (you)' : ''}
                </span>
                <span className={styles.rowStats}>
                  {r.daysAttended} day(s) · {r.onTimeDays} on time
                </span>
              </div>
              <div className={styles.track}>
                <div className={`${styles.fill} ${isYou ? styles.fillYou : ''}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
