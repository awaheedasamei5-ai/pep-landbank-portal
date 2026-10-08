"use client";

import { useEffect, useState } from 'react';
import type { AttendancePolicy } from '../../../types/domain';
import styles from './AttendancePolicyCard.module.css';

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

// Attendance plan Part 4: "the work hours, the grace period, which days
// count as workdays ... all editable from inside Attendance's own
// management view, with a history of what the policy used to be."
// Writes go through set_attendance_policy() (via useAttendanceManagement's
// updatePolicy), which versions the row server-side rather than
// overwriting it -- a historical sign-in stays judged against whatever
// policy was actually in force on that date.
export function AttendancePolicyCard({ policy, onUpdate }: { policy: AttendancePolicy | null; onUpdate: (input: { workStartTime: string; workEndTime: string; graceMinutes: number; workDays: number[] }) => Promise<void> }) {
  const [workStartTime, setWorkStartTime] = useState(policy?.workStartTime ?? '08:00');
  const [workEndTime, setWorkEndTime] = useState(policy?.workEndTime ?? '17:00');
  const [graceMinutes, setGraceMinutes] = useState(policy?.graceMinutes ?? 15);
  const [workDays, setWorkDays] = useState<number[]>(policy?.workDays ?? [1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Local form state only has real values to seed from once the policy
  // query resolves (it's null on first render) -- sync it in rather than
  // leaving the form stuck on hardcoded defaults after a real policy
  // loads in.
  useEffect(() => {
    if (!policy) return;
    setWorkStartTime(policy.workStartTime);
    setWorkEndTime(policy.workEndTime);
    setGraceMinutes(policy.graceMinutes);
    setWorkDays(policy.workDays);
  }, [policy]);

  function toggleDay(d: number) {
    setWorkDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await onUpdate({ workStartTime, workEndTime, graceMinutes, workDays });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <h3>Attendance policy</h3>
      <p className={styles.sub}>What counts as "late" and which days count as workdays. Changing this creates a new version — past sign-ins stay judged against the policy that was in force then.</p>

      <div className={styles.row}>
        <label className={styles.field}>
          <span>Work start</span>
          <input type="time" value={workStartTime} onChange={(e) => setWorkStartTime(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Work end</span>
          <input type="time" value={workEndTime} onChange={(e) => setWorkEndTime(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Grace (minutes)</span>
          <input type="number" min={0} max={120} value={graceMinutes} onChange={(e) => setGraceMinutes(Number(e.target.value))} />
        </label>
      </div>

      <div className={styles.daysRow}>
        <span className={styles.daysLabel}>Workdays</span>
        <div className={styles.days}>
          {WEEKDAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`${styles.dayBtn} ${workDays.includes(d.value) ? styles.dayActive : ''}`}
              onClick={() => toggleDay(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        {policy && <span className={styles.currentNote}>Currently in force since {policy.effectiveFrom}</span>}
        <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save policy'}
        </button>
      </div>
    </div>
  );
}
