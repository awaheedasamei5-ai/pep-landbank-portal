import type { TodayStreak } from '../hooks/useTodayStreak';
import { useStreakCoaching } from '../hooks/useStreakCoaching';
import { StreakWeekRow } from './StreakWeekRow';
import styles from './StreakCard.module.css';

// Port of streakWidgetHtml() (index.html:10461-10507). Two panes (daily
// streak / pipeline status) crossfade forever via pure CSS -- see the
// moodFade keyframe in StreakCard.module.css -- no JS timer. The AI
// coaching line below is new for V2 -- a real Groq-backed insight, not
// a port of anything in the old app.
export function StreakCard({ streak }: { streak: TodayStreak }) {
  const { mood, pet, petMood, weekHistory, risk, riskLabel, streakLen } = streak;
  const severe = petMood.severity === 'severe';
  const { data: coaching } = useStreakCoaching(streak);

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
        {coaching && (
          <div className={styles.aiRow}>
            <span className={styles.aiBadge}>AI</span>
            <span>{coaching}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Port of streakLoadingHtml() (index.html:10447-10459) -- the old app's own
// comment called pet_small.gif a better fit for "a loading moment" than any
// of the full mood poses, but web-next never actually had a loading state
// here: HomeScreen only ever rendered {streak.data && <StreakCard .../>},
// so the card was simply absent (a layout jump) while the query ran. This
// fills that real gap with the asset that was always meant for it.
export function StreakCardSkeleton() {
  return (
    <div className={styles.card}>
      <div className={styles.bgLayer} style={{ background: 'linear-gradient(135deg,#64748B,#475569)', animation: 'none' }} />
      <div className={styles.artLayer}>
        <div className={styles.artPane} style={{ animation: 'none' }}>
          <img className={styles.artImg} src="/pet/pet_small.gif" alt="" draggable={false} />
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.cardTop}>
          <div className={styles.moodPane} style={{ animation: 'none' }}>
            <div className={styles.eyebrow}>Pipeline status</div>
            <div className={styles.num}>Loading…</div>
          </div>
        </div>
      </div>
    </div>
  );
}
