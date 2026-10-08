"use client";

import { useState } from 'react';
import type { AttendanceException } from '../../../types/domain';
import styles from './AttendanceExceptionsQueue.module.css';

const TYPE_LABELS: Record<string, string> = {
  errand: 'Errand',
  site_visit: 'Site visit',
  field_assignment: 'Field assignment',
  other: 'Other',
};

// Attendance plan Part 4 -- "a staff member's one-off exception request
// ... a real, small queue to clear, not something that has to become a
// whole leave day". Real attendance_exceptions rows, decided here.
export function AttendanceExceptionsQueue({
  pending,
  onDecide,
}: {
  pending: AttendanceException[];
  onDecide: (id: string, status: 'approved' | 'declined') => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, status: 'approved' | 'declined') {
    setBusy(id);
    try {
      await onDecide(id, status);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <h3>Exception requests {pending.length > 0 && <span className={styles.count}>{pending.length}</span>}</h3>
      {!pending.length ? (
        <p className={styles.empty}>No exception requests waiting.</p>
      ) : (
        <div className={styles.list}>
          {pending.map((exc) => (
            <div key={exc.id} className={styles.row}>
              <div className={styles.info}>
                <div className={styles.top}>
                  <strong>{exc.staffName}</strong>
                  <span className={styles.type}>{TYPE_LABELS[exc.exceptionType] ?? exc.exceptionType}</span>
                  <span className={styles.date}>{exc.exceptionDate}</span>
                </div>
                <p className={styles.reason}>{exc.reason}</p>
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.declineBtn} disabled={busy === exc.id} onClick={() => decide(exc.id, 'declined')}>
                  Decline
                </button>
                <button type="button" className={styles.approveBtn} disabled={busy === exc.id} onClick={() => decide(exc.id, 'approved')}>
                  {busy === exc.id ? '…' : 'Approve'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
