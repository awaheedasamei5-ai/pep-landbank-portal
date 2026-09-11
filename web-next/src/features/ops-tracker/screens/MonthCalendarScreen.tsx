import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMyScheduleRange } from '../hooks/useCalendar';
import { isoDateOnly, fmtLongDate } from '../../../shared/lib/format';
import { DayItemList } from '../components/DayItemList';
import { ItemDetailModal } from '../components/ItemDetailModal';
import type { ScheduleItem } from '../../../types/domain';
import styles from './MonthCalendarScreen.module.css';

// Master Spec 10.1: "Month Calendar — high-level planning." A standard
// 6-row month grid; each cell shows up to 3 item chips plus a "+N more"
// overflow rather than trying to fit every item, since a busy day would
// otherwise blow out the cell height.
//
// Real user ask (2026-09-06): clicking a day did nothing before -- it now
// opens a real day-detail panel (the same DayItemList Week uses) listing
// every item that day, each opening ItemDetailModal.
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MAX_CHIPS = 3;

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function MonthCalendarScreen() {
  // Real deep-link support: the Dashboard's history heatmap links here as
  // /month?day=YYYY-MM-DD so clicking a specific day's cell actually opens
  // that day's real detail here, not just the tab in general.
  const [searchParams] = useSearchParams();
  const linkedDay = searchParams.get('day');
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(linkedDay ? new Date(`${linkedDay}T00:00:00`) : new Date()));
  const todayIso = isoDateOnly(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(linkedDay);
  const [openItem, setOpenItem] = useState<ScheduleItem | null>(null);

  const firstOfMonth = viewMonth;
  const daysInMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate();
  // Monday-first grid: JS getDay() is Sunday-first (0), shift so Monday=0.
  const leadBlanks = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - leadBlanks);
  const totalCells = Math.ceil((leadBlanks + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const fromDate = isoDateOnly(cells[0]);
  const toDate = isoDateOnly(cells[cells.length - 1]);
  const { data: items, isLoading } = useMyScheduleRange(fromDate, toDate);

  const byDay = new Map<string, ScheduleItem[]>();
  (items ?? []).forEach((it) => {
    if (!it.date) return;
    const list = byDay.get(it.date) ?? [];
    list.push(it);
    byDay.set(it.date, list);
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.nav}>
        <button type="button" className={styles.navBtn} onClick={() => setViewMonth(new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() - 1, 1))}>
          ‹
        </button>
        <div className={styles.navLabel}>{firstOfMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
        <button type="button" className={styles.navBtn} onClick={() => setViewMonth(new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 1))}>
          ›
        </button>
      </div>

      {isLoading && <p className={styles.empty}>Loading…</p>}

      <div className={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w) => (
          <span key={w} className={styles.weekdayLabel}>
            {w}
          </span>
        ))}
      </div>
      <div className={styles.grid}>
        {cells.map((d) => {
          const iso = isoDateOnly(d);
          const inMonth = d.getMonth() === firstOfMonth.getMonth();
          const dayItems = byDay.get(iso) ?? [];
          return (
            <button
              key={iso}
              type="button"
              className={`${styles.cell} ${inMonth ? '' : styles.cellOutside} ${iso === todayIso ? styles.cellToday : ''} ${iso === selectedDay ? styles.cellSelected : ''}`}
              onClick={() => setSelectedDay(iso)}
            >
              <div className={styles.cellNum}>{d.getDate()}</div>
              <div className={styles.cellChips}>
                {dayItems.slice(0, MAX_CHIPS).map((it) => (
                  <div key={it.id} className={`${styles.chip} ${it.status === 'closed' ? styles.chipDone : ''}`}>
                    {it.startTime && `${it.startTime.slice(0, 5)} `}
                    {it.title}
                  </div>
                ))}
                {dayItems.length > MAX_CHIPS && <div className={styles.chipMore}>+{dayItems.length - MAX_CHIPS} more</div>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className={styles.selectedPanel}>
          <div className={styles.selectedHead}>
            <div className={styles.selectedTitle}>{fmtLongDate(selectedDay)}</div>
            <button type="button" className={styles.selectedClose} onClick={() => setSelectedDay(null)}>
              ✕
            </button>
          </div>
          <DayItemList items={byDay.get(selectedDay) ?? []} onSelect={setOpenItem} />
        </div>
      )}

      {openItem && <ItemDetailModal item={openItem} onClose={() => setOpenItem(null)} />}
    </div>
  );
}
