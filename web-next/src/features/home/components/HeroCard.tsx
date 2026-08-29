import type { ReactNode } from 'react';
import { ghs } from '../../../shared/lib/format';
import styles from './HeroCard.module.css';

// Simplified port of agentHome()'s hero section (index.html:10535-10566) --
// greeting + pipeline value + a slot for the StreakCard. Commission/
// documents quick-chips are out of scope for Phase 1.
export function HeroCard({ greetName, pipelineValue, children }: { greetName: string; pipelineValue: number; children?: ReactNode }) {
  return (
    <div className={styles.hero}>
      <div className={styles.greet}>Good morning, {greetName}</div>
      <div className={styles.label}>Pipeline value</div>
      <div className={styles.value}>{ghs(pipelineValue)}</div>
      {children && <div className={styles.streakSlot}>{children}</div>}
    </div>
  );
}
