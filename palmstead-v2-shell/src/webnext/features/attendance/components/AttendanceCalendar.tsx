"use client";

import type { DayCell } from '../hooks/useAttendanceMonth';
import styles from './AttendanceCalendar.module.css';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function cellClass(cell: DayCell): string {
  if (cell.isFuture) return styles.future;
  if (cell.isOnLeave) return styles.leave;
  if (!cell.isWorkday) return styles.weekend;
  if (cell.record?.signInAt) return cell.isLate ? styles.late : styles.onTime;
  return styles.absent;
}

function cellTitle(cell: DayCell): string {
  if (cell.isFuture) return `${cell.date} — upcoming`;
  if (cell.isOnLeave) return `${cell.date} — on leave`;
  if (!cell.isWorkday) return `${cell.date} — not a workday`;
  if (cell.record?.signInAt) return `${cell.date} — ${cell.isLate ? 'late' : 'on time'}`;
  return `${cell.date} — absent`;
}

// Leave-aware calendar heatmap (Attendance plan Part 3) -- every day of
// the current month colored by what actually happened, using the same
// real attendance_log + leave_requests rows the month KPI card sums up,
// so the two views can never disagree.
export function AttendanceCalendar({ cells }: { cells: DayCell[] }) {
  if (!cells.length) return null;
  const [fy, fm, fd] = cells[0].date.split('-').map(Number);
  const leadingBlanks = new Date(fy, fm - 1, fd).getDay();

  return (
    <div className={styles.wrap}>
      <div className={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className={styles.grid}>
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <span key={`b${i}`} />
        ))}
        {cells.map((cell) => (
          <div key={cell.date} className={`${styles.cell} ${cellClass(cell)}`} title={cellTitle(cell)}>
            {cell.dayOfMonth}
          </div>
        ))}
      </div>
      <div className={styles.legend}>
        <span><i className={styles.onTime} /> On time</span>
        <span><i className={styles.late} /> Late</span>
        <span><i className={styles.absent} /> Absent</span>
        <span><i className={styles.leave} /> Leave</span>
        <span><i className={styles.weekend} /> Off day</span>
      </div>
    </div>
  );
}
