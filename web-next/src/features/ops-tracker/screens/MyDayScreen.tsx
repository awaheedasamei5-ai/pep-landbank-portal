import { useState } from 'react';
import { useTodayTodos, useCreateTodo, useUpdateTodoStatus } from '../hooks/useTodayTodos';
import styles from './MyDayScreen.module.css';

// Simplified port of paintMyDayTab()'s to-do side (index.html:13060-13082) --
// a checklist for today only. The time-axis day grid, due-today tasks, and
// week-ahead preview are out of scope for this slice; this exists mainly to
// make computeTodayTodoProgress() (the StreakCard's pre-deadline mood)
// respond to a real user action instead of only ever reading seed data.
export function MyDayScreen() {
  const { data: todos, isLoading } = useTodayTodos();
  const createTodo = useCreateTodo();
  const updateStatus = useUpdateTodoStatus();
  const [title, setTitle] = useState('');

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    await createTodo.mutateAsync(t);
    setTitle('');
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
