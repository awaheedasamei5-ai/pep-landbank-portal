import type { ScheduleItem } from '../../../types/domain';
import { Avatar } from '../../../shared/ui/Avatar';
import styles from './DayItemList.module.css';

// Real user ask (2026-09-06): "when u select a day on the calenders, u
// should be able to see all the task u did on that day." Groups a day's
// real items by time-of-day (matching the reference mobile UI's day-picker
// + "Morning" section-header pattern) rather than a flat list -- shared
// between Week and Month so selecting a day reads identically in both.
//
// Redesigned 2026-09-05 to match the reference "Task Schedule" screen's
// exact timeline layout: a time label + connector line on the left, a real
// card on the right with title/description/kind pill/assignee avatar --
// not the flat single-line rows this used before.
function timeGroup(item: ScheduleItem): 'Morning' | 'Afternoon' | 'Evening' | 'Anytime' {
  if (!item.startTime) return 'Anytime';
  const hour = Number(item.startTime.slice(0, 2));
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function fmtHourLabel(t: string): string {
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr}\n${ampm}`;
}

function kindPillLabel(item: ScheduleItem): string {
  if (item.kind === 'meeting') return 'Meeting';
  if (item.kind === 'task') return item.status === 'in_progress' ? 'In Progress' : item.status === 'closed' ? 'Done' : item.status === 'blocked' ? 'Blocked' : 'To Do';
  return item.status === 'closed' ? 'Done' : 'To Do';
}

export function DayItemList({ items, onSelect }: { items: ScheduleItem[]; onSelect: (item: ScheduleItem) => void }) {
  if (items.length === 0) return <p className={styles.empty}>Nothing scheduled this day.</p>;

  const groups: Record<string, ScheduleItem[]> = { Morning: [], Afternoon: [], Evening: [], Anytime: [] };
  items.forEach((it) => groups[timeGroup(it)].push(it));
  Object.values(groups).forEach((list) => list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')));

  return (
    <div className={styles.wrap}>
      {(['Morning', 'Afternoon', 'Evening', 'Anytime'] as const).map(
        (group) =>
          groups[group].length > 0 && (
            <div key={group} className={styles.group}>
              <div className={styles.groupLabel}>{group}</div>
              {groups[group].map((it, i) => {
                const person = it.assignedToName ?? it.ownerName;
                const isLast = i === groups[group].length - 1;
                return (
                  <div key={it.id} className={styles.timelineRow}>
                    <div className={styles.timeRail}>
                      <span className={styles.timeLabel}>{it.startTime ? fmtHourLabel(it.startTime) : '--'}</span>
                      {!isLast && <span className={styles.connector} />}
                    </div>
                    <button type="button" className={`${styles.card} ${it.status === 'closed' ? styles.cardDone : ''}`} onClick={() => onSelect(it)}>
                      <div className={styles.cardTitle}>{it.title}</div>
                      {it.description && <div className={styles.cardDesc}>{it.description}</div>}
                      <div className={styles.cardFoot}>
                        {person && <Avatar name={person} size={22} />}
                        <span className={`${styles.kindPill} ${styles[`kindPill_${it.kind}`]}`}>{kindPillLabel(it)}</span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )
      )}
    </div>
  );
}
