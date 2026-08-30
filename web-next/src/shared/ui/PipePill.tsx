import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';
import styles from './PipePill.module.css';

export type PillTone = 'blue' | 'orange' | 'gold' | 'green' | 'red';

export function PipePillStrip({ children }: { children: ReactNode }) {
  return <div className={styles.strip}>{children}</div>;
}

// `trend` is optional and additive -- only pills with a real monthly series
// behind them (see ManagerOverview.collectedTrend) get the embedded
// sparkline; every other pill renders exactly as before.
export function PipePill({ tone, value, label, isMoney, trend }: { tone: PillTone; value: ReactNode; label: string; isMoney?: boolean; trend?: number[] }) {
  return (
    <div className={`${styles.pill} ${styles[tone]}`}>
      <div className={styles.topRow}>
        <div className={`${styles.value} ${isMoney ? styles.valueMoney : ''}`}>{value}</div>
        {trend && trend.length > 1 && (
          <div className={styles.spark}>
            <Sparkline values={trend} />
          </div>
        )}
      </div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
