"use client";

import type { PeriodFilterState } from '../lib/periodFilter';
import styles from './PeriodFilterBar.module.css';

// Shared control for usePeriodFilter -- see that file's own comment for
// why this exists as one component instead of five near-identical ones.
// `resultCount` is optional context copy ("N shown"); `totalCount` (when
// given) drives the "showing N of TOTAL -- widen the filter to see the
// rest" hint so it's obvious data isn't missing, just filtered out.
export function PeriodFilterBar({ state, resultCount, totalCount }: { state: PeriodFilterState; resultCount?: number; totalCount?: number }) {
  const { mode, setMode, monthKey, setMonthKey, dayKey, setDayKey, yearKey, setYearKey, customFrom, setCustomFrom, customTo, setCustomTo, isThisMonth, resetToThisMonth } = state;

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <div className={styles.modeGroup}>
          {(['month', 'day', 'year', 'custom', 'all'] as const).map((m) => (
            <button key={m} type="button" className={`${styles.modeBtn} ${mode === m ? styles.modeBtnOn : ''}`} onClick={() => setMode(m)}>
              {m === 'month' ? 'Month' : m === 'day' ? 'Day' : m === 'year' ? 'Year' : m === 'custom' ? 'Range' : 'All time'}
            </button>
          ))}
        </div>
        {!isThisMonth && (
          <button type="button" className={styles.resetBtn} onClick={resetToThisMonth}>
            This month
          </button>
        )}
      </div>
      <div className={styles.row}>
        {mode === 'month' && <input type="month" className={styles.picker} value={monthKey} onChange={(e) => setMonthKey(e.target.value)} />}
        {mode === 'day' && <input type="date" className={styles.picker} value={dayKey} onChange={(e) => setDayKey(e.target.value)} />}
        {mode === 'year' && (
          <input
            type="number"
            className={styles.picker}
            value={yearKey}
            min={2015}
            max={2100}
            onChange={(e) => setYearKey(e.target.value)}
          />
        )}
        {mode === 'custom' && (
          <>
            <input type="date" className={styles.picker} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className={styles.toLabel}>to</span>
            <input type="date" className={styles.picker} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </>
        )}
        {resultCount != null && (
          <span className={styles.count}>
            {resultCount} shown
            {totalCount != null && totalCount > resultCount ? ` of ${totalCount} total` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
