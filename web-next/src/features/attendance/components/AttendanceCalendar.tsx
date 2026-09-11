import { useMemo, useState } from 'react';
import { useAttendanceHistory } from '../hooks/useAttendance';
import { useLeaveRequests } from '../../leave/hooks/useLeaveRequests';
import { buildCalendarMonth, type CalendarDay, type CalendarDayStatus } from '../lib/attendanceRosterLogic';
import { monthKey as toMonthKey, shiftMonth, isoDateOnly, today as todayIso } from '../../../shared/lib/format';
import type { AttendanceRecord } from '../../../types/domain';
import styles from './AttendanceCalendar.module.css';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const LEGEND: { status: CalendarDayStatus; label: string; color: string }[] = [
  { status: 'present', label: 'Present', color: 'var(--c-success)' },
  { status: 'late', label: 'Late', color: 'var(--c-warn)' },
  { status: 'absent', label: 'Absent', color: 'var(--c-danger)' },
  { status: 'onLeave', label: 'On leave', color: 'var(--c-info)' },
  { status: 'notWorkday', label: 'Day off', color: 'var(--c-line)' },
];

function longMonthLabel(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

interface AttendanceCalendarProps {
  staffKey: string;
  workDays: number[];
  cutoff: string;
  onSelectRecord: (r: AttendanceRecord) => void;
}

// ATTENDANCE_BLUEPRINT.md §5. Fetches its own wider (186-day / ~6-month)
// history window rather than reusing the "recent history" list's shorter
// 31-day fetch -- browsing further back than that is disabled (prev nav
// button greys out) rather than lazily merge-loading more months the way
// v1's attEnsureCalendarMonthLoaded did; simpler and still real (no fake
// empty months), just a shallower browse-back horizon.
export function AttendanceCalendar({ staffKey, workDays, cutoff, onSelectRecord }: AttendanceCalendarProps) {
  const { data: history } = useAttendanceHistory(186);
  const { data: leaveRequests } = useLeaveRequests();
  const today = todayIso();
  const [browsedMonth, setBrowsedMonth] = useState(toMonthKey(today));

  const earliestMonth = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 180);
    return toMonthKey(isoDateOnly(d));
  }, []);

  const days = useMemo(
    () => buildCalendarMonth(browsedMonth, history ?? [], leaveRequests ?? [], staffKey, workDays, cutoff, today),
    [browsedMonth, history, leaveRequests, staffKey, workDays, cutoff, today]
  );

  const leadingBlanks = new Date(`${browsedMonth}-01T00:00:00`).getDay();

  return (
    <div className={styles.card}>
      <div className={styles.headRow}>
        <h3 className={styles.title}>{longMonthLabel(browsedMonth)}</h3>
        <div className={styles.navRow}>
          <button type="button" className={styles.navBtn} onClick={() => setBrowsedMonth((mk) => shiftMonth(mk, -1))} disabled={browsedMonth <= earliestMonth} aria-label="Previous month">
            ‹
          </button>
          <button type="button" className={styles.navBtn} onClick={() => setBrowsedMonth((mk) => shiftMonth(mk, 1))} disabled={browsedMonth >= toMonthKey(today)} aria-label="Next month">
            ›
          </button>
        </div>
      </div>

      <div className={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w, i) => (
          <span className={styles.weekdayLabel} key={i}>
            {w}
          </span>
        ))}
      </div>

      <div className={styles.grid}>
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <span key={`pad_${i}`} className={`${styles.cell} ${styles.cellPad}`} />
        ))}
        {days.map((d) => (
          <CalendarCell key={d.date} day={d} isToday={d.date === today} onSelectRecord={onSelectRecord} />
        ))}
      </div>

      <div className={styles.legend}>
        {LEGEND.map((l) => (
          <span className={styles.legendItem} key={l.status}>
            <span className={styles.legendSwatch} style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function CalendarCell({ day, isToday, onSelectRecord }: { day: CalendarDay; isToday: boolean; onSelectRecord: (r: AttendanceRecord) => void }) {
  const clickable = !!day.record;
  return (
    <button
      type="button"
      className={`${styles.cell} ${styles[`status_${day.status}`]} ${isToday ? styles.today : ''} ${clickable ? styles.cellClickable : ''}`}
      disabled={!clickable}
      onClick={() => day.record && onSelectRecord(day.record)}
    >
      {day.dayNum}
    </button>
  );
}
