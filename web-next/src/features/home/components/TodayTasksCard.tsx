import { Link } from 'react-router';
import { useTodayTodos } from '../../ops-tracker/hooks/useTodayTodos';
import styles from './TodayTasksCard.module.css';

// New for V2 -- the old app never surfaced today's task counts on the
// Home dashboard at all (only inside My Day itself). Real, live counts:
// completing or adding a todo anywhere -- this device, another tab,
// another device entirely -- updates this card immediately via
// useDashboardRealtime()'s schedule_items subscription (mounted once at
// the app-shell level), not just same-tab cache invalidation.
export function TodayTasksCard() {
  const { data: todos, isLoading } = useTodayTodos();
  if (isLoading || !todos) return null;

  const active = todos.filter((t) => t.status !== 'rescheduled');
  const done = active.filter((t) => t.status === 'closed').length;
  const open = active.filter((t) => t.status === 'open').length;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h3 className={styles.title}>Today&apos;s tasks</h3>
        <span className={styles.liveDot}>
          <i /> Live
        </span>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <b>{active.length}</b>
          <span>Total</span>
        </div>
        <div className={styles.stat}>
          <b>{open}</b>
          <span>Open</span>
        </div>
        <div className={styles.stat}>
          <b>{done}</b>
          <span>Done</span>
        </div>
      </div>
      <Link to="/app/office/myday" className={styles.link}>
        Open My Day →
      </Link>
    </div>
  );
}
