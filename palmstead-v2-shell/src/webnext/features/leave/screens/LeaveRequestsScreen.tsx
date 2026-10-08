"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { MyLeaveRow, PlannedLeaveRow } from '../components/LeaveRequestRow';
import type { LeaveRequest } from '../../../types/domain';
import styles from './LeaveRequestsScreen.module.css';

const ALL_STATUSES: LeaveRequest['status'][] = ['planned', 'pending', 'approved', 'declined', 'rescheduled'];
const STATUS_FILTER_LABEL: Record<LeaveRequest['status'], string> = {
  planned: 'Planned',
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
  rescheduled: 'Rescheduled',
};

// Real filterable history page -- the destination every status card on the
// Dashboard links to (?status=X), plus a year filter. Previously this was
// just "every request in one flat list" on the same screen as everything
// else.
export function LeaveRequestsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') as LeaveRequest['status'] | null;
  const yearFilter = searchParams.get('year');

  const profile = useSessionStore((s) => s.profile);
  const myKey = profile?.key ?? '';
  const { data: requests, isLoading } = useLeaveRequests();

  const all = requests ?? [];
  const mine = all.filter((r) => r.agentKey === myKey);
  const years = Array.from(new Set(mine.map((r) => String(r.year)))).sort().reverse();

  let filtered = mine;
  if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter);
  if (yearFilter) filtered = filtered.filter((r) => String(r.year) === yearFilter);
  filtered = filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/dashboard/leave/requests${next.toString() ? `?${next.toString()}` : ''}`);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <Link href="/dashboard/leave" className={styles.backLink}>
            ← Dashboard
          </Link>
          <h1 className={styles.title}>My requests</h1>
          <p className={styles.sub}>
            {filtered.length} request{filtered.length === 1 ? '' : 's'}
            {statusFilter ? ` · ${STATUS_FILTER_LABEL[statusFilter]}` : ''}
          </p>
        </div>
      </div>

      <div className={styles.filters}>
        <select className={styles.select} value={statusFilter ?? ''} onChange={(e) => setParam('status', e.target.value || null)}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_FILTER_LABEL[s]}
            </option>
          ))}
        </select>
        <select className={styles.select} value={yearFilter ?? ''} onChange={(e) => setParam('year', e.target.value || null)}>
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className={styles.hint}>Loading…</p>}
      {!isLoading && filtered.length === 0 && <p className={styles.hint}>No matching requests.</p>}
      <div className={styles.list}>
        {filtered.map((r) => (r.status === 'planned' ? <PlannedLeaveRow key={r.id} request={r} /> : <MyLeaveRow key={r.id} request={r} />))}
      </div>
    </div>
  );
}
