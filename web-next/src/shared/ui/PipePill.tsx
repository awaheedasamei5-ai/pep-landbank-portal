import type { ReactNode } from 'react';
import styles from './PipePill.module.css';

export type PillTone = 'blue' | 'orange' | 'gold' | 'green' | 'red';

export function PipePillStrip({ children }: { children: ReactNode }) {
  return <div className={styles.strip}>{children}</div>;
}

export function PipePill({ tone, value, label, isMoney }: { tone: PillTone; value: ReactNode; label: string; isMoney?: boolean }) {
  return (
    <div className={`${styles.pill} ${styles[tone]}`}>
      <div className={`${styles.value} ${isMoney ? styles.valueMoney : ''}`}>{value}</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
