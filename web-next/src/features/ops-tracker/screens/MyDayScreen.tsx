import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useStaffDirectory } from '../../memos/hooks/useMemos';
import { useTodayTodos, useCreateTodo, useUpdateTodoStatus } from '../hooks/useTodayTodos';
import { useColleagueAvailability } from '../hooks/useColleagueAvailability';
import { today } from '../../../shared/lib/format';
import styles from './MyDayScreen.module.css';

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

  function toggle(id: string, currentlyDone: boolean) {
    updateStatus.mutate({ id, status: currentlyDone ? 'open' : 'closed' });
  }

  const active = (todos ?? []).filter((t) => t.status !== 'rescheduled');

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
      {active.map((t) => {
        const done = t.status === 'closed';
        return (
          <div className={styles.row} key={t.id}>
            <button type="button" className={done ? styles.checkDone : styles.check} onClick={() => toggle(t.id, done)} aria-label={done ? 'Mark not done' : 'Mark done'}>
              {done ? '✓' : ''}
            </button>
            <span className={done ? styles.textDone : styles.text}>{t.title}</span>
          </div>
        );
      })}
      {active.length === 0 && !isLoading && <p className={styles.empty}>Nothing logged for today yet — add your first to-do above.</p>}
    </div>
  );
}
