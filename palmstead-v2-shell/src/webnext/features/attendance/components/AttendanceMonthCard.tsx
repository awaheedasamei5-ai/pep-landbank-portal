"use client";

import { DonutRing } from '../../banners/components/BannerCharts';
import styles from './AttendanceMonthCard.module.css';

// Reuses the same real DonutRing primitive the Banner Health hero panel
// uses (banners/components/BannerCharts.tsx) -- this app's own
// on-time-rate gauge, not a new chart component.
export function AttendanceMonthCard({
  monthLabel,
  stats,
}: {
  monthLabel: string;
  stats: { workdaysSoFar: number; daysAttended: number; onTimeDays: number; lateDays: number; absences: number; leaveDaysCount: number; attendanceRate: number; onTimeRate: number };
}) {
  return (
    <div className={styles.card}>
      <div className={styles.ringCol}>
        <div className={styles.ringWrap}>
          <DonutRing pct={stats.onTimeRate} size={92} stroke={10} />
          <div className={styles.ringLabel}>
            <strong>{stats.onTimeRate}%</strong>
            <span>on time</span>
          </div>
        </div>
        <div className={styles.monthLabel}>{monthLabel}</div>
      </div>
      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <strong>{stats.attendanceRate}%</strong>
          <span>Attendance rate</span>
        </div>
        <div className={styles.stat}>
          <strong>{stats.daysAttended}</strong>
          <span>Days attended</span>
        </div>
        <div className={styles.stat}>
          <strong>{stats.lateDays}</strong>
          <span>Late days</span>
        </div>
        <div className={styles.stat}>
          <strong className={stats.absences > 0 ? styles.warn : undefined}>{stats.absences}</strong>
          <span>Absences</span>
        </div>
        <div className={styles.stat}>
          <strong>{stats.leaveDaysCount}</strong>
          <span>On leave</span>
        </div>
        <div className={styles.stat}>
          <strong>{stats.workdaysSoFar}</strong>
          <span>Workdays so far</span>
        </div>
      </div>
    </div>
  );
}
