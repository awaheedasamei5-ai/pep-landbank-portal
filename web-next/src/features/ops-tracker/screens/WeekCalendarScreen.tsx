import { useState } from 'react';
import { useMyScheduleRange } from '../hooks/useCalendar';
import { mondayOfDate } from '../../site-visit-auth/lib/siteVisitAuthLogic';
import { isoDateOnly, isoPlusDays, fmtLongDate } from '../../../shared/lib/format';
import { DayItemList } from '../components/DayItemList';
import { ItemDetailModal } from '../components/ItemDetailModal';
import type { ScheduleItem } from '../../../types/domain';
import styles from './WeekCalendarScreen.module.css';

// Master Spec 10.1: "Week Calendar — time-grid for meetings and
// scheduled work." Reads the same schedule_items rows My Day/Task Board
// already own (todo+task+meeting together, whichever day they fall on)
// over one Monday-Sunday week at a time -- no separate data model.
//
// Real user ask (2026-09-06): the week strip alone was an inert tile --
// clicking a day did nothing. It's now a real day picker: clicking a day
// column selects it (defaults to today) and a real detail list of that
// day's items renders below, each opening ItemDetailModal.
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const KIND_FILTERS: { key: 'all' | ScheduleItem['kind']; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'task', label: 'Tasks' },
  { key: 'meeting', label: 'Meetings' },
  { key: 'todo', label: 'To-dos' },
];

export function WeekCalendarScreen() {
  const [weekStart, setWeekStart] = useState(() => isoDateOnly(mondayOfDate(new Date())));
  const weekEnd = isoPlusDays(weekStart, 6);
  const { data: items, isLoading } = useMyScheduleRange(weekStart, weekEnd);
  const todayIso = isoDateOnly(new Date());
  const [selectedDay, setSelectedDay] = useState(todayIso);
  const [openItem, setOpenItem] = useState<ScheduleItem | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | ScheduleItem['kind']>('all');

  const days = Array.from({ length: 7 }, (_, i) => isoPlusDays(weekStart, i));
  const byDay = new Map<string, ScheduleItem[]>();
  (items ?? []).forEach((it) => {
    if (!it.date) return;
    const list = byDay.get(it.date) ?? [];
    list.push(it);
    byDay.set(it.date, list);
  });
  byDay.forEach((list) => list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')));

  function goWeek(delta: number) {
    setWeekStart((w) => isoPlusDays(w, delta * 7));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.nav}>
        <button type="button" className={styles.navBtn} onClick={() => goWeek(-1)}>
          ‹
        </button>
        <div className={styles.navLabel}>
          {new Date(`${weekStart}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} –{' '}
          {new Date(`${weekEnd}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
        <button type="button" className={styles.navBtn} onClick={() => goWeek(1)}>
          ›
        </button>
      </div>

      {isLoading && <p className={styles.empty}>Loading…</p>}

      {/* Matches the reference "Task Schedule" screen's day-picker exactly:
          a row of circular day buttons, the selected day filled solid,
          a small dot underneath standing in for the reference's own
          minimal per-day indicator (real data: any real item that day). */}
      <div className={styles.dayPicker}>
        {days.map((d, i) => {
          const count = (byDay.get(d) ?? []).length;
          const isSelected = d === selectedDay;
          return (
            <button key={d} type="button" className={styles.dayCircleCol} onClick={() => setSelectedDay(d)}>
              <span className={styles.dayCircleLabel}>{DAY_LABELS[i]}</span>
              <span className={`${styles.dayCircle} ${isSelected ? styles.dayCircleSelected : ''} ${d === todayIso && !isSelected ? styles.dayCircleToday : ''}`}>{new Date(`${d}T00:00:00`).getDate()}</span>
              <span className={`${styles.dayDot} ${count > 0 ? styles.dayDotActive : ''}`} />
            </button>
          );
        })}
      </div>

      <div className={styles.kindFilters}>
        {KIND_FILTERS.map((f) => (
          <button key={f.key} type="button" className={`${styles.kindFilterPill} ${kindFilter === f.key ? styles.kindFilterActive : ''}`} onClick={() => setKindFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.selectedPanel}>
        <div className={styles.selectedHead}>
          <div className={styles.selectedTitle}>{fmtLongDate(selectedDay)}</div>
          {selectedDay === todayIso && <span className={styles.todayBadge}>Today</span>}
        </div>
        <DayItemList items={(byDay.get(selectedDay) ?? []).filter((it) => kindFilter === 'all' || it.kind === kindFilter)} onSelect={setOpenItem} />
      </div>

      {openItem && <ItemDetailModal item={openItem} onClose={() => setOpenItem(null)} />}
    </div>
  );
}
