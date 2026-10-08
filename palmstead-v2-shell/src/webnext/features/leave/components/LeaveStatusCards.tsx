"use client";

import Link from 'next/link';
import type { LeaveRequest } from '../../../types/domain';
import styles from './LeaveStatusCards.module.css';

const STATUSES: { key: LeaveRequest['status']; label: string; accent: string }[] = [
  { key: 'planned', label: 'Planned', accent: styles.accentMuted },
  { key: 'pending', label: 'Pending', accent: styles.accentPending },
  { key: 'approved', label: 'Approved', accent: styles.accentApproved },
  { key: 'declined', label: 'Declined', accent: styles.accentDeclined },
  { key: 'rescheduled', label: 'Rescheduled', accent: styles.accentPending },
];

// Reference repo's real "click the number, land on the filtered list"
// pattern -- the dashboard answers "how many" and is also the entry point
// into "show me exactly which ones."
export function LeaveStatusCards({ requests, baseHref }: { requests: LeaveRequest[]; baseHref: string }) {
  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s.key] = requests.filter((r) => r.status === s.key).length;
    return acc;
  }, {});

  return (
    <div className={styles.grid}>
      {STATUSES.map((s) => (
        <Link key={s.key} href={`${baseHref}?status=${s.key}`} className={styles.card}>
          <div className={`${styles.accentBar} ${s.accent}`} />
          <div className={styles.cardBody}>
            <span className={styles.count}>{counts[s.key] ?? 0}</span>
            <span className={styles.label}>{s.label}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
