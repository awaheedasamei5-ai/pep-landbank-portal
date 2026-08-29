import { isoDateOnly, today } from '../../../shared/lib/format';
import styles from './StreakCard.module.css';

// Port of streakWeekRowHtml() (index.html:10403-10412).
export function StreakWeekRow({ history }: { history: { date: string; dayMet: boolean }[] }) {
  const byDate: Record<string, boolean> = {};
  history.forEach((r) => {
    byDate[r.date] = r.dayMet;
  });
  const d = new Date(today() + 'T00:00:00');
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  return (
    <div className={styles.weekRow}>
      {labels.map((lbl, i) => {
        const dt = new Date(monday);
        dt.setDate(monday.getDate() + i);
        const iso = isoDateOnly(dt);
        const met = byDate[iso];
        const isFuture = iso > today();
        const markClass = met ? styles.weekMarkMet : isFuture ? styles.weekMarkFuture : '';
        return (
          <div className={styles.weekDay} key={lbl}>
            <div className={styles.weekLbl}>{lbl}</div>
            <div className={`${styles.weekMark} ${markClass}`}>{met ? '✓' : isFuture ? '' : '✕'}</div>
          </div>
        );
      })}
    </div>
  );
}
