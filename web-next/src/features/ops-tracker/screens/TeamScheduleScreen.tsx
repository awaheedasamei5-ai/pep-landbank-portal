import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useTeamScheduleRange } from '../hooks/useCalendar';
import { isoDateOnly, isoPlusDays } from '../../../shared/lib/format';
import { mondayOfDate } from '../../site-visit-auth/lib/siteVisitAuthLogic';
import { ItemDetailModal } from '../components/ItemDetailModal';
import type { ScheduleItem } from '../../../types/domain';
import styles from './TeamScheduleScreen.module.css';

// Master Spec 10.1: "Team Schedule — Management view by staff member."
// One row per staff member, one column per day of the selected week --
// every todo/task/meeting on the same real schedule_items rows the
// individual views read, just grouped by owner/assignee instead of by
// the viewer's own key.
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function TeamScheduleScreen() {
  const profile = useSessionStore((s) => s.profile);
  const isManager = profile?.role === 'manager';
  const [weekStart, setWeekStart] = useState(() => isoDateOnly(mondayOfDate(new Date())));
  const weekEnd = isoPlusDays(weekStart, 6);
  const { data: staff } = useStaffDirectory();
  const { data: items, isLoading } = useTeamScheduleRange(weekStart, weekEnd);
  const [openItem, setOpenItem] = useState<ScheduleItem | null>(null);

  if (!isManager) {
    return (
      <div className={styles.wrap}>
        <p className={styles.empty}>Management only.</p>
      </div>
    );
  }

  const days = Array.from({ length: 7 }, (_, i) => isoPlusDays(weekStart, i));
  const byStaffDay = new Map<string, ScheduleItem[]>();
  (items ?? []).forEach((it) => {
    if (!it.date) return;
    const key = `${it.assignedTo}__${it.date}`;
    const list = byStaffDay.get(key) ?? [];
    list.push(it);
    byStaffDay.set(key, list);
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.nav}>
        <button type="button" className={styles.navBtn} onClick={() => setWeekStart((w) => isoPlusDays(w, -7))}>
          ‹
        </button>
        <div className={styles.navLabel}>
          {new Date(`${weekStart}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} –{' '}
          {new Date(`${weekEnd}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
        <button type="button" className={styles.navBtn} onClick={() => setWeekStart((w) => isoPlusDays(w, 7))}>
          ›
        </button>
      </div>

      {isLoading && <p className={styles.empty}>Loading…</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.staffHeadCell}>Staff</th>
              {days.map((d, i) => (
                <th key={d} className={styles.dayHeadCell}>
                  {DAY_LABELS[i]} {new Date(`${d}T00:00:00`).getDate()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(staff ?? []).map((s) => (
              <tr key={s.key}>
                <td className={styles.staffCell}>{s.name}</td>
                {days.map((d) => {
                  const dayItems = byStaffDay.get(`${s.key}__${d}`) ?? [];
                  return (
                    <td key={d} className={styles.dayCell}>
                      {dayItems.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          className={`${styles.chip} ${it.kind === 'meeting' ? styles.chipMeeting : it.kind === 'task' ? styles.chipTask : styles.chipTodo}`}
                          title={it.startTime ? `${it.startTime.slice(0, 5)} ${it.title}` : it.title}
                          onClick={() => setOpenItem(it)}
                        >
                          {it.startTime && `${it.startTime.slice(0, 5)} `}
                          {it.title}
                        </button>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openItem && <ItemDetailModal item={openItem} onClose={() => setOpenItem(null)} />}
    </div>
  );
}
