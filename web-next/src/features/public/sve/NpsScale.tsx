import styles from './SveFeedbackScreen.module.css';

export function NpsScale({ value, onChange }: { value: number | undefined; onChange: (n: number) => void }) {
  return (
    <div className={styles.npsRow} role="radiogroup" aria-label="Likelihood to recommend, 0 to 10">
      {Array.from({ length: 11 }, (_, i) => i).map((n) => (
        <button key={n} type="button" className={`${styles.npsBtn} ${value === n ? styles.npsBtnActive : ''}`} role="radio" aria-checked={value === n} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}
