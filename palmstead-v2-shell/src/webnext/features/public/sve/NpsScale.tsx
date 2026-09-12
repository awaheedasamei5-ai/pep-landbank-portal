"use client";

import styles from './SveFeedbackScreen.module.css';

// Real user ask (2026-09-12): the real Jotform's NPS scale is 1-10
// ("Not likely at all" under 1, "Extremely likely" under 10), not the
// classic 0-10 an earlier pass here built.
export function NpsScale({ value, onChange }: { value: number | undefined; onChange: (n: number) => void }) {
  return (
    <div className={styles.npsRow} role="radiogroup" aria-label="Likelihood to recommend, 1 to 10">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" className={`${styles.npsBtn} ${value === n ? styles.npsBtnActive : ''}`} role="radio" aria-checked={value === n} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}
