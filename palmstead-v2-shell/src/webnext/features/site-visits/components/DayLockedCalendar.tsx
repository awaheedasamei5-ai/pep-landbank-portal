"use client";

import { useEffect, useRef, useState } from 'react';
import styles from './DayLockedCalendar.module.css';

// User's explicit ask (2026-09-03): "the field for the expected date
// should only show the dates for the day selected only lets say u select
// saturday as the visit day, when u click on the expected date, the
// other days monday to sundays should be locked and cant be selected
// just only saturday can be selected." A plain <input type="date"> can't
// express that (its `min`/`max` only bound a range, not a weekday), so
// this is a real custom month-grid picker: every cell whose weekday
// doesn't match `allowedDow`, or that falls before `minIso`, renders
// disabled and dimmed rather than just being harder to notice.
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function DayLockedCalendar({ value, allowedDow, minIso, onChange }: { value: string; allowedDow: number; minIso: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(value ? new Date(`${value}T00:00:00`) : new Date()));
  // The day-chip row and this calendar share one date -- whichever one
  // changes it, the other stays in sync, so jumping the month view here
  // is automatic instead of a second thing the user has to redo by hand.
  // Derived during render (not an effect) per React's own "adjusting
  // state when a prop changes" pattern -- avoids the extra render an
  // effect-driven setState would otherwise trigger on every date change.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value && value !== syncedValue) {
    setSyncedValue(value);
    setViewMonth(startOfMonth(new Date(`${value}T00:00:00`)));
  }
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const min = new Date(`${minIso}T00:00:00`);
  min.setHours(0, 0, 0, 0);

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const leadBlanks = viewMonth.getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));

  return (
    <div className={styles.wrap} ref={ref}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((o) => !o)}>
        {value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Select a date'}
        <span className={styles.caret}>▾</span>
      </button>
      {open && (
        <div className={styles.pop}>
          <div className={styles.head}>
            <button type="button" className={styles.nav} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} aria-label="Previous month">
              ‹
            </button>
            <span className={styles.monthLabel}>{viewMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
            <button type="button" className={styles.nav} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} aria-label="Next month">
              ›
            </button>
          </div>
          <div className={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((w, i) => (
              <span key={w} className={i === allowedDow ? styles.weekdayOn : styles.weekday}>
                {w}
              </span>
            ))}
          </div>
          <div className={styles.grid}>
            {cells.map((d, i) => {
              if (!d) return <span key={`b${i}`} className={styles.blank} />;
              const iso = isoOf(d);
              const enabled = d.getDay() === allowedDow && d >= min;
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!enabled}
                  className={`${styles.day} ${enabled ? styles.dayOn : styles.dayOff} ${selected ? styles.daySelected : ''}`}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}