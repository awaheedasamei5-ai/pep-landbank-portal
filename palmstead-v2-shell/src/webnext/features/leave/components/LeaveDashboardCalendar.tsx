"use client";

import { ghanaHolidayMapForYear, isWeekendIso } from '../../../shared/lib/ghanaHolidays';
import { companyClosuresForYear } from '../lib/leaveLogic';
import { today } from '../../../shared/lib/format';
import type { Config, LeaveHoliday, LeaveRequest } from '../../../types/domain';
import styles from './LeaveCalendar.module.css';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function iso(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Dashboard's own READ-ONLY month view (reference repo pattern: a real
// calendar with confirmed leave days colored, not a date picker) --
// distinct from LeaveCalendar.tsx, which is the click-to-select picker
// used on the Plan/New-request pages. Reuses the exact same grid CSS.
export function LeaveDashboardCalendar({
  year,
  month,
  onNavMonth,
  approvedRequests,
  config,
  companyClosures = [],
}: {
  year: number;
  month: number;
  onNavMonth: (delta: number) => void;
  approvedRequests: LeaveRequest[];
  config: Config;
  companyClosures?: LeaveHoliday[];
}) {
  const nDays = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const leaveDays = new Set(approvedRequests.flatMap((r) => r.dates || []));
  const holidays = ghanaHolidayMapForYear(year, config.eidWindows, companyClosuresForYear(companyClosures, year));
  const t = today();

  const cells: { iso: string | null; day: number }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ iso: null, day: 0 });
  for (let d = 1; d <= nDays; d++) cells.push({ iso: iso(year, month, d), day: d });

  return (
    <div>
      <div className={styles.nav}>
        <button type="button" className={styles.navBtn} onClick={() => onNavMonth(-1)} aria-label="Previous month">
          &lsaquo;
        </button>
        <div className={styles.navLabel}>
          {MONTH_NAMES[month]} {year}
        </div>
        <button type="button" className={styles.navBtn} onClick={() => onNavMonth(1)} aria-label="Next month">
          &rsaquo;
        </button>
      </div>
      <div className={styles.grid}>
        {WEEKDAY_LABELS.map((w, i) => (
          <div className={styles.wd} key={i}>
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c.iso) return <div className={`${styles.cell} ${styles.empty}`} key={i} />;
          const cellIso = c.iso;
          const isToday = cellIso === t;
          const isWeekend = isWeekendIso(cellIso);
          const holiday = holidays.get(cellIso);
          const isOnLeave = leaveDays.has(cellIso);
          const cls = [styles.cell, isOnLeave && styles.taken, !!holiday && !isOnLeave && styles.holiday, isWeekend && !isOnLeave && !holiday && styles.weekend, isToday && styles.today]
            .filter(Boolean)
            .join(' ');
          return (
            <div key={cellIso} className={cls} title={isOnLeave ? 'Approved leave' : holiday?.name || ''}>
              {c.day}
            </div>
          );
        })}
      </div>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <i className={styles.legendSwatch} style={{ background: 'var(--c-danger)' }} />
          Approved leave
        </span>
        <span className={styles.legendItem}>
          <i className={styles.legendSwatch} style={{ background: 'var(--c-warn)' }} />
          Public holiday
        </span>
      </div>
    </div>
  );
}
