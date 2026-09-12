"use client";

import styles from './AttendanceComparison.module.css';

export function AttendanceComparison({
  you,
  rank,
  teamCount,
  teamAvgOnTime,
  teamAvgAttended,
}: {
  you: { daysAttended: number; onTimeDays: number } | null;
  rank: number | null;
  teamCount: number;
  teamAvgOnTime: number;
  teamAvgAttended: number;
}) {
  if (!teamCount) return null;
  const yourOnTime = you?.onTimeDays ?? 0;
  const yourAttended = you?.daysAttended ?? 0;
  const maxOnTime = Math.max(yourOnTime, teamAvgOnTime, 1);
  const maxAttended = Math.max(yourAttended, teamAvgAttended, 1);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h3>You vs the team</h3>
        {rank && <span className={styles.rank}>Rank #{rank} of {teamCount}</span>}
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>On-time days</div>
        <div className={styles.bars}>
          <div className={styles.barTrack}>
            <div className={`${styles.bar} ${styles.you}`} style={{ width: `${(yourOnTime / maxOnTime) * 100}%` }} />
          </div>
          <span className={styles.barVal}>{yourOnTime}</span>
        </div>
        <div className={styles.bars}>
          <div className={styles.barTrack}>
            <div className={`${styles.bar} ${styles.team}`} style={{ width: `${(teamAvgOnTime / maxOnTime) * 100}%` }} />
          </div>
          <span className={styles.barVal}>{teamAvgOnTime}</span>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>Days attended</div>
        <div className={styles.bars}>
          <div className={styles.barTrack}>
            <div className={`${styles.bar} ${styles.you}`} style={{ width: `${(yourAttended / maxAttended) * 100}%` }} />
          </div>
          <span className={styles.barVal}>{yourAttended}</span>
        </div>
        <div className={styles.bars}>
          <div className={styles.barTrack}>
            <div className={`${styles.bar} ${styles.team}`} style={{ width: `${(teamAvgAttended / maxAttended) * 100}%` }} />
          </div>
          <span className={styles.barVal}>{teamAvgAttended}</span>
        </div>
      </div>

      <div className={styles.legend}>
        <span><i className={styles.you} /> You</span>
        <span><i className={styles.team} /> Team average</span>
      </div>
    </div>
  );
}
