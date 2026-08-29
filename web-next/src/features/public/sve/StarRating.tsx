import styles from './SveFeedbackScreen.module.css';

export function StarRating({ value, onChange, max = 5 }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className={styles.stars} role="radiogroup">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={styles.star}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-checked={value === n}
          role="radio"
          onClick={() => onChange(n)}
        >
          {n <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}
