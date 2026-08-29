import type { ReactNode } from 'react';
import { ghs } from '../../../shared/lib/format';
import styles from './HeroCard.module.css';

// Simplified port of agentHome()'s hero section (index.html:10535-10566) --
// greeting + pipeline value + a slot for the StreakCard. The commission
// chip (heroCommissionChip) has landed; the documents quick-chip stays
// out of scope.
export function HeroCard({ greetName, pipelineValue, myCommission, onCommissionClick, children }: { greetName: string; pipelineValue: number; myCommission?: number; onCommissionClick?: () => void; children?: ReactNode }) {
  return (
    <div className={styles.hero}>
      <div className={styles.greet}>Good morning, {greetName}</div>
      <div className={styles.label}>Pipeline value</div>
      <div className={styles.value}>{ghs(pipelineValue)}</div>
      {onCommissionClick && (
        <button type="button" className={styles.commissionChip} onClick={onCommissionClick}>
          <span className={styles.commissionChipLabel}>My commission</span>
          <span className={styles.commissionChipVal}>{ghs(myCommission ?? 0)}</span>
        </button>
      )}
      {children && <div className={styles.streakSlot}>{children}</div>}
    </div>
  );
}
