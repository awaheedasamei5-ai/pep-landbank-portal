import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useTodayTodos, useCreateTodo, useUpdateTodoStatus } from '../hooks/useTodayTodos';
import { useColleagueAvailability } from '../hooks/useColleagueAvailability';
import { DayClearedCelebration } from '../../streak/components/DayClearedCelebration';
import { today } from '../../../shared/lib/format';
import type { ScheduleItemStatus } from '../../../types/domain';
import styles from './MyDayScreen.module.css';

// Real kanban, not a decorative board -- these 4 columns are the actual
// ScheduleItemStatus union (types/domain.ts), no invented lane that isn't
// backed by a real, persisted status. Adapted from the task-board pattern
// studied on Dribbble/Figma this session (columns of cards, a status chip
// per card) onto the app's own token palette.
const COLUMNS: { status: ScheduleItemStatus; label: string; color: string }[] = [
  { status: 'open', label: 'Open', color: 'var(--c-info)' },
  { status: 'rescheduled', label: 'Rescheduled', color: 'var(--c-warn)' },
  { status: 'cancelled', label: 'Cancelled', color: 'var(--c-danger)' },
  { status: 'closed', label: 'Closed', color: 'var(--c-success)' },
];

// Simplified port of paintMyDayTab()'s to-do side (index.html:13060-13082) --
// a checklist for today only. The time-axis day grid, due-today tasks, and
// week-ahead preview are out of scope for this slice; this exists mainly to
// make computeTodayTodoProgress() (the StreakCard's pre-deadline mood)
// respond to a real user action instead of only ever reading seed data.
// New for V2: an optional "Assign to" picker backed by a real AI
// availability check (useColleagueAvailability) -- genuinely new
// capability, not in the old app at all.
export function MyDayScreen() {
  const profile = useSessionStore((s) => s.profile);
  const { data: todos, isLoading } = useTodayTodos();
  const { data: staff } = useStaffDirectory();
  const createTodo = useCreateTodo();
  const updateStatus = useUpdateTodoStatus();
  const [title, setTitle] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [justAssigned, setJustAssigned] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const colleagues = (staff ?? []).filter((s) => s.key !== profile?.key);
  const selectedColleague = colleagues.find((c) => c.key === assignTo);
  const availability = useColleagueAvailability(assignTo, selectedColleague?.name ?? '', today());

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    await createTodo.mutateAsync({ title: t, assignedTo: assignTo || undefined });
    setTitle('');
    setJustAssigned(selectedColleague ? selectedColleague.name : null);
    setAssignTo('');
  }

  const all = todos ?? [];

  function changeStatus(id: string, status: ScheduleItemStatus) {
    // Fires the confetti celebration exactly once, on the action that
    // actually clears the last remaining open item -- not on every render
    // where the list happens to already be empty (e.g. nothing logged yet).
    if (status === 'closed') {
      const remainingOpen = all.filter((t) => t.id !== id && t.status === 'open').length;
      if (remainingOpen === 0) setCelebrate(true);
    }
    updateStatus.mutate({ id, status });
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>My Day</h1>
      <p className={styles.sub}>Today's to-do list</p>

      <form className={styles.addRow} onSubmit={addTodo}>
        <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow up with Mercy" />
        <button type="submit" className={styles.addBtn} disabled={createTodo.isPending || !title.trim()}>
          Add
        </button>
      </form>

      {colleagues.length > 0 && (
        <div className={styles.assignRow}>
          <span className={styles.assignLabel}>Assign to</span>
          <select
            className={styles.assignSelect}
            value={assignTo}
            onChange={(e) => {
              setAssignTo(e.target.value);
              setJustAssigned(null);
            }}
          >
            <option value="">Myself</option>
            {colleagues.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedColleague && (
        <div className={styles.availCard}>
          <div className={styles.availFacts}>
            <span className={`${styles.availChip} ${availability.data?.onLeave ? styles.availChipWarn : styles.availChipOk}`}>{availability.isLoading ? 'Checking…' : availability.data?.onLeave ? `On leave (${availability.data.leaveStatus})` : 'Not on leave today'}</span>
            {!availability.isLoading && <span className={`${styles.availChip} ${(availability.data?.existingTaskCount ?? 0) > 2 ? styles.availChipWarn : styles.availChipOk}`}>{availability.data?.existingTaskCount ?? 0} task(s) already today</span>}
          </div>
          {availability.data?.aiMessage && (
            <div className={styles.availAi}>
              <span className={styles.availAiBadge}>AI</span>
              <span>{availability.data.aiMessage}</span>
            </div>
          )}
        </div>
      )}

      {justAssigned && <p className={styles.empty}>Assigned to {justAssigned} — it'll show up on their My Day, not yours.</p>}

      {isLoading && <p className={styles.empty}>Loading…</p>}
      {!isLoading && all.length === 0 && <p className={styles.empty}>Nothing logged for today yet — add your first to-do above.</p>}

      {!isLoading && all.length > 0 && (
        <div className={styles.board}>
          {COLUMNS.map((col) => {
            const items = all.filter((t) => t.status === col.status);
            return (
              <div className={styles.column} key={col.status}>
                <div className={styles.columnHead}>
                  <span className={styles.columnDot} style={{ background: col.color }} />
                  <span className={styles.columnLabel}>{col.label}</span>
                  <span className={styles.columnCount}>{items.length}</span>
                </div>
                <div className={styles.columnBody}>
                  {items.map((t) => (
                    <div className={styles.card} key={t.id}>
                      <div className={styles.cardTitle}>{t.title}</div>
                      <select className={styles.cardMoveSelect} value={t.status} onChange={(e) => changeStatus(t.id, e.target.value as ScheduleItemStatus)} aria-label={`Move "${t.title}"`}>
                        {COLUMNS.map((c) => (
                          <option key={c.status} value={c.status}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {items.length === 0 && <div className={styles.columnEmpty}>Nothing here</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {celebrate && <DayClearedCelebration onClose={() => setCelebrate(false)} />}
    </div>
  );
}
