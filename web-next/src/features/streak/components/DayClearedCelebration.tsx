import styles from './DayClearedCelebration.module.css';

// Port of openAchievementUnlockModal's visual language (index.html:19700-
// 19734, CSS at index.html:1568-1585) -- gold badge + confetti burst
// (party_burst.gif) behind it. The old app used this for a full points-based
// achievement system web-next hasn't ported. Rather than fake that system
// with invented definitions/thresholds, this gives the confetti asset its
// own honest, real trigger: clearing today's entire to-do list, the one
// concrete "did the day's work" moment every agent actually has today.
export function DayClearedCelebration({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.card} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Today's to-do list cleared">
        <img className={styles.burst} src="/pet/party_burst.gif" alt="" draggable={false} />
        <div className={styles.title}>Today's list, cleared!</div>
        <div className={styles.sub}>Every to-do you logged today is done. That's the day's work — see you tomorrow.</div>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          Nice!
        </button>
      </div>
    </div>
  );
}
