"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { useDownloadLeaveLetterPdf } from '../hooks/useLeaveLetterPdf';
import { leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved } from '../lib/leaveLogic';
import { fmtLongDate, today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';
import styles from './LeaveManagementRequestsScreen.module.css';

const ALL_STATUSES: LeaveRequest['status'][] = ['planned', 'pending', 'approved', 'declined', 'rescheduled'];
const STATUS_LABEL: Record<LeaveRequest['status'], string> = { planned: 'Planned', pending: 'Pending', approved: 'Approved', declined: 'Declined', rescheduled: 'Reschedule requested' };
const STATUS_CLASS: Record<LeaveRequest['status'], string> = { planned: 'tagMuted', pending: 'tagPending', approved: 'tagApproved', declined: 'tagDeclined', rescheduled: 'tagPending' };

function dateRangeLabel(r: LeaveRequest): string {
  const first = r.dates[0] ?? '';
  const last = r.dates[r.dates.length - 1] ?? '';
  if (!first) return '';
  return last && last !== first ? `${fmtLongDate(first)} to ${fmtLongDate(last)}` : fmtLongDate(first);
}

function useActiveAgentRoster() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['leaveAgentRoster'],
    queryFn: async () => (await getDataSource(demoMode).staff.listAll()).filter((s) => s.role === 'agent' && s.active),
  });
}

// Company-wide, filterable history -- the "every staff member" roster
// (per-person live countdown, expand for their own request history)
// plus a flat filterable list across everyone, as its own route instead
// of being folded into the Management dashboard home.
export function LeaveManagementRequestsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') as LeaveRequest['status'] | null;
  const yearFilter = searchParams.get('year');
  const staffFilter = searchParams.get('staff');

  const { data: config } = useConfig();
  const { data: roster } = useActiveAgentRoster();
  const { data: requests } = useLeaveRequests();
  const downloadLetter = useDownloadLeaveLetterPdf();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const year = new Date(today()).getFullYear();
  const all = requests ?? [];
  const visible = all.filter((r) => r.status !== 'planned');
  const years = Array.from(new Set(visible.map((r) => String(r.year)))).sort().reverse();

  let filtered = visible;
  if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter);
  if (yearFilter) filtered = filtered.filter((r) => String(r.year) === yearFilter);
  if (staffFilter) filtered = filtered.filter((r) => r.agentKey === staffFilter);
  filtered = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/dashboard/leave/management/requests${next.toString() ? `?${next.toString()}` : ''}`);
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <Link href="/dashboard/leave/management" className={styles.backLink}>
          ← Management
        </Link>
        <h1 className={styles.title}>Company-wide requests</h1>
        <p className={styles.sub}>
          {filtered.length} request{filtered.length === 1 ? '' : 's'}
          {statusFilter ? ` · ${STATUS_LABEL[statusFilter]}` : ''}
        </p>
      </div>

      <div className={styles.filters}>
        <select className={styles.select} value={staffFilter ?? ''} onChange={(e) => setParam('staff', e.target.value || null)}>
          <option value="">All staff</option>
          {(roster ?? []).map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        <select className={styles.select} value={statusFilter ?? ''} onChange={(e) => setParam('status', e.target.value || null)}>
          <option value="">All statuses</option>
          {ALL_STATUSES.filter((s) => s !== 'planned').map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
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

      {!statusFilter && !yearFilter && !staffFilter && (
        <>
          <div className={styles.sectitle}>Every staff member — {year}</div>
          {!roster && <p className={styles.hint}>Loading roster…</p>}
          {roster && roster.length === 0 && <p className={styles.hint}>No active staff on the roster.</p>}
          <div className={styles.list}>
            {(roster ?? []).map((s) => {
              const reserved = config ? leaveDaysReserved(visible, s.key, year) : 0;
              const confirmedUsed = leaveDaysConfirmedUsed(visible, s.key, year, today());
              const remaining = config ? leaveDaysRemaining(config, visible, s.key, year) : null;
              const own = visible.filter((r) => r.agentKey === s.key).sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''));
              const isOpen = expanded.has(s.key);
              return (
                <div className={styles.staffRow} key={s.key}>
                  <button type="button" className={styles.staffHead} onClick={() => toggle(s.key)}>
                    <div className={styles.rowMain}>
                      <div className={styles.name}>{s.name}</div>
                      <div className={styles.meta}>
                        {own.length} request{own.length === 1 ? '' : 's'} in {year}
                      </div>
                    </div>
                    <span className={styles.remainingBadge}>
                      {remaining ?? '--'}/{config?.leaveTotalDays ?? '--'} left
                    </span>
                    <span className={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && (
                    <div className={styles.staffDates}>
                      {own.length === 0 && <p className={styles.hint}>No leave requests yet.</p>}
                      {own.map((r) => (
                        <div className={styles.dateRow} key={r.id}>
                          <span>
                            {dateRangeLabel(r)}
                            {r.isEmergency ? ' · 🚨' : ''}
                          </span>
                          <span className={styles[STATUS_CLASS[r.status]]}>{STATUS_LABEL[r.status]}</span>
                        </div>
                      ))}
                      <div className={styles.usedNote}>
                        {reserved} reserved &middot; {confirmedUsed} confirmed used of {config?.leaveTotalDays ?? 20} in {year}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className={styles.sectitle}>{statusFilter || yearFilter || staffFilter ? 'Matching requests' : 'All requests'}</div>
      {filtered.length === 0 && <p className={styles.hint}>No matching requests.</p>}
      <div className={styles.list}>
        {filtered.map((r) => (
          <div className={styles.row} key={r.id}>
            <div className={styles.rowMain}>
              <div className={styles.name}>
                {r.agentName}
                {r.isEmergency && <span className={styles.emergencyTag}>🚨 Emergency</span>}
              </div>
              <div className={styles.meta}>
                {r.daysCount} day{r.daysCount === 1 ? '' : 's'} &middot; {dateRangeLabel(r)}
              </div>
              {r.letterText && (
                <button type="button" className={styles.letterBtn} disabled={downloadLetter.isPending} onClick={() => downloadLetter.mutate(r)}>
                  {downloadLetter.isPending ? 'Preparing…' : '📄 Leave request letter'}
                </button>
              )}
            </div>
            <span className={styles[STATUS_CLASS[r.status]]}>{STATUS_LABEL[r.status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
