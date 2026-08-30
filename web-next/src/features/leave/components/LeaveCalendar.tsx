import { fmtLongDate, today } from '../../../shared/lib/format';
import { ghanaHolidayMapForYear, isWeekendIso } from '../../../shared/lib/ghanaHolidays';
import { leaveConflictDatesFromOthers, leaveIsBlocking } from '../lib/leaveLogic';
import type { Config, LeaveRequest } from '../../../types/domain';
import styles from './LeaveCalendar.module.css';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function leaveIso(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Port of index.html's paintLeaveCalendar() (index.html:23949-23986) --
// same cell states (weekend/holiday/already-taken/colleague-conflict/
// selected/today/past), same click-to-toggle multi-select.
export function LeaveCalendar({
  year,
  month,
  onNavMonth,
  requests,
  agentKey,
  config,
  selectedDates,
  onToggleDate,
}: {
  year: number;
  month: number;
  onNavMonth: (delta: number) => void;
  requests: LeaveRequest[];
  agentKey: string;
  config: Config;
  selectedDates: string[];
  onToggleDate: (iso: string) => void;
}) {
  const nDays = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const myTaken = new Set(
    requests
      .filter((r) => r.agentKey === agentKey && leaveIsBlocking(r.status))
      .flatMap((r) => r.dates || []),
  );
  const otherConflicts = leaveConflictDatesFromOthers(requests, agentKey);
  const holidays = ghanaHolidayMapForYear(year);
  const observesEid = (config.eidObservingStaff || []).includes(agentKey);
  const t = today();

  const cells: { iso: string | null; day: number }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ iso: null, day: 0 });
  for (let d = 1; d <= nDays; d++) cells.push({ iso: leaveIso(year, month, d), day: d });

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
          const iso = c.iso;
          const isSel = selectedDates.includes(iso);
          const isPast = iso < t;
          const isToday = iso === t;
          const isWeekend = isWeekendIso(iso);
          const holiday = holidays.get(iso);
          const isHoliday = !!holiday && !(holiday.isEid && observesEid);
          const isTaken = myTaken.has(iso) && !isSel;
          const isConflict = otherConflicts.has(iso) && !isSel;
          const disabled = isPast || isWeekend || isHoliday || isTaken || isConflict;
          let reason = '';
          if (isTaken) reason = 'Already requested';
          else if (isConflict) reason = "Conflicts with a colleague's leave";
          else if (isHoliday) reason = holiday?.name ?? '';
          else if (isWeekend) reason = 'Weekend';
          const cls = [styles.cell, isSel && styles.sel, (isTaken || isConflict) && styles.taken, isHoliday && styles.holiday, isWeekend && styles.weekend, isToday && styles.today].filter(Boolean).join(' ');
          return (
            <button type="button" key={iso} className={cls} disabled={disabled} title={reason} onClick={() => onToggleDate(iso)}>
              {c.day}
            </button>
          );
        })}
      </div>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <i className={styles.legendSwatch} style={{ background: 'var(--ink)' }} />
          Selected
        </span>
        <span className={styles.legendItem}>
          <i className={styles.legendSwatch} style={{ background: '#F6EBD3' }} />
          Public holiday
        </span>
        <span className={styles.legendItem}>
          <i className={styles.legendSwatch} style={{ background: 'var(--danger)', opacity: 0.6 }} />
          Taken / colleague&apos;s leave
        </span>
      </div>
      <div className={styles.summary}>Selected: {selectedDates.length ? `${selectedDates.length} day(s) selected` : 'none yet'}</div>
      {selectedDates.length > 0 && (
        <div className={styles.chips}>
          {selectedDates
            .slice()
            .sort()
            .map((d) => (
              <button type="button" key={d} className={styles.chip} onClick={() => onToggleDate(d)}>
                {fmtLongDate(d)} ✕
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
