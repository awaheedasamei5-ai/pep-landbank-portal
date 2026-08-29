import type { TodayStreak } from '../hooks/useTodayStreak';
import { StreakWeekRow } from './StreakWeekRow';
import styles from './StreakCard.module.css';

// Port of streakWidgetHtml() (index.html:10461-10507). Two panes (daily
// streak / pipeline status) crossfade forever via pure CSS -- see the
// moodFade keyframe in StreakCard.module.css -- no JS timer.
export function StreakCard({ streak }: { streak: TodayStreak }) {
  const { mood, pet, petMood, weekHistory, risk, riskLabel, streakLen } = streak;
  const severe = petMood.severity === 'severe';

  return (
    <div className={styles.card}>
      <div className={`${styles.bgLayer}`} style={{ background: mood.bg }} />
      <div className={`${styles.bgLayer} ${styles.bgB}`} style={{ background: pet.bg }} />
      <div className={styles.artLayer}>
        <div className={styles.artPane}>
          <img className={styles.artImg} src={mood.img} alt={mood.emoji} draggable={false} />
        </div>
        <div className={`${styles.artPane} ${styles.bgB}`}>
          <img className={styles.artImg} src={pet.img} alt="pipeline mood" draggable={false} data-severe={severe || undefined} />
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.cardTop}>
          <div className={styles.moodStack}>
            <div className={styles.moodPane}>
              <div className={styles.eyebrow}>Daily streak</div>
              <div className={styles.num}>
                {streakLen} day{streakLen === 1 ? '' : 's'}
              </div>
              <div className={styles.lbl}>{mood.label}</div>
            </div>
            <div className={`${styles.moodPane} ${styles.bgB}`}>
              <div className={styles.eyebrow}>Pipeline status</div>
              <div className={styles.num} style={{ color: pet.color }}>
                {pet.label}
              </div>
              <div className={styles.lbl}>{riskLabel}</div>
            </div>
          </div>
        </div>
        <StreakWeekRow history={weekHistory} />
        <div className={styles.riskRow}>
          <span className={`${styles.riskDot} ${styles[pet.dotClass]}`} />
          {risk.daysLeft} day{risk.daysLeft === 1 ? '' : 's'} left this month · pipeline {pet.label.toLowerCase()}
        </div>
      </div>
    </div>
  );
}
