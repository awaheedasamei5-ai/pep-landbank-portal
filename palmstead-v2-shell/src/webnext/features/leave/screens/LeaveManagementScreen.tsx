"use client";

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useDecideLeaveRequest, useLeaveRequests, useRescheduleLeaveRequest } from '../hooks/useLeaveRequests';
import { useDownloadLeaveLetterPdf } from '../hooks/useLeaveLetterPdf';
import { leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved, leaveUpcomingForAll } from '../lib/leaveLogic';
import { fmtLongDate, today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';
import styles from './LeaveManagementScreen.module.css';

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

// Plan Part 4, written from Management's own seat: every staff member's
// whole year visible at once, a live remaining-days number, unprompted
// approaching-leave alerts, emergency requests standing out visually,
// and approve/decline/reschedule as one screen, one action -- the real
// company-wide "who's out this week/month" view V1 never had at all.
export function LeaveManagementScreen() {
  const { data: config } = useConfig();
  const { data: roster } = useActiveAgentRoster();
  const { data: requests } = useLeaveRequests();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const year = new Date(today()).getFullYear();
  const all = requests ?? [];
  const visible = all.filter((r) => r.status !== 'planned');
  const pending = visible.filter((r) => r.status === 'pending').sort((a, b) => (a.isEmergency === b.isEmergency ? a.createdAt.localeCompare(b.createdAt) : a.isEmergency ? -1 : 1));

  const upcoming = useMemo(() => leaveUpcomingForAll(visible, today(), 7), [visible]);
  const emergencies = useMemo(
    () => [...visible.filter((r) => r.isEmergency)].sort((a, b) => (a.status === 'pending' ? -1 : b.status === 'pending' ? 1 : b.createdAt.localeCompare(a.createdAt))),
    [visible],
  );
  const pendingEmergencyCount = emergencies.filter((r) => r.status === 'pending').length;

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
        <p className={styles.sub}>Every staff member&apos;s {year} leave plan, at a glance</p>
      </div>

      <div className={styles.summaryRow}>
        <div className={styles.summaryTile}>
          <div className={styles.summaryCount}>{roster?.length ?? 0}</div>
          <div className={styles.summaryLabel}>Staff</div>
        </div>
        <div className={styles.summaryTile}>
          <div className={styles.summaryCount}>{upcoming.length}</div>
          <div className={styles.summaryLabel}>Leave coming up</div>
        </div>
        <div className={`${styles.summaryTile} ${pendingEmergencyCount > 0 ? styles.summaryEmergency : ''}`}>
          <div className={styles.summaryCount}>{pendingEmergencyCount}</div>
          <div className={styles.summaryLabel}>Emergency pending</div>
        </div>
      </div>

      {pending.length > 0 && (
        <>
          <div className={styles.sectitle}>Pending decisions</div>
          <div className={styles.list}>
            {pending.map((r) => (
              <PendingRequestRow key={r.id} request={r} />
            ))}
          </div>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <div className={styles.sectitle}>Coming up in the next 7 days</div>
          <div className={styles.list}>
            {upcoming.map(({ request, startDate }) => (
              <div className={styles.row} key={request.id}>
                <div className={styles.rowMain}>
                  <div className={styles.name}>
                    {request.agentName}
                    {request.isEmergency && <span className={styles.emergencyTag}>🚨 Emergency</span>}
                  </div>
                  <div className={styles.meta}>
                    Starts {fmtLongDate(startDate)} &middot; {dateRangeLabel(request)}
                  </div>
                </div>
                <span className={styles[STATUS_CLASS[request.status]]}>{STATUS_LABEL[request.status]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {emergencies.length > 0 && (
        <>
          <div className={styles.sectitle}>🚨 Emergency leave</div>
          <div className={styles.list}>
            {emergencies.map((r) => (
              <div className={styles.row} key={r.id}>
                <div className={styles.rowMain}>
                  <div className={styles.name}>{r.agentName}</div>
                  <div className={styles.meta}>
                    {r.daysCount} day{r.daysCount === 1 ? '' : 's'} &middot; {dateRangeLabel(r)}
                  </div>
                </div>
                <span className={styles[STATUS_CLASS[r.status]]}>{STATUS_LABEL[r.status]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.sectitle}>Every staff member</div>
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
    </div>
  );
}

// One screen, one action -- Plan Part 4. Approve/decline/reschedule all
// live directly on the pending row itself, no separate review modal.
function PendingRequestRow({ request }: { request: LeaveRequest }) {
  const decide = useDecideLeaveRequest();
  const reschedule = useRescheduleLeaveRequest();
  const downloadLetter = useDownloadLeaveLetterPdf();
  const [pendingAction, setPendingAction] = useState<'decline' | 'reschedule' | null>(null);
  const [note, setNote] = useState('');
  const [deductQuota, setDeductQuota] = useState(true);
  const [rescheduleDates, setRescheduleDates] = useState<string[]>([]);
  const [newDateInput, setNewDateInput] = useState('');
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const busy = decide.isPending || reschedule.isPending;

  function approve() {
    decide.mutate({ id: request.id, outcome: 'approved', agentKey: request.agentKey, agentName: request.agentName, daysCount: request.daysCount, year: request.year, deductQuota });
  }
  function cancelPending() {
    setPendingAction(null);
    setNote('');
    setRescheduleDates([]);
    setNewDateInput('');
    setRescheduleError(null);
  }
  function confirmDecline() {
    decide.mutate({ id: request.id, outcome: 'declined', agentKey: request.agentKey, agentName: request.agentName, daysCount: request.daysCount, year: request.year, note: note.trim() || undefined });
    cancelPending();
  }
  function addRescheduleDate() {
    if (!newDateInput || rescheduleDates.includes(newDateInput)) return;
    setRescheduleDates((prev) => [...prev, newDateInput].sort());
    setNewDateInput('');
  }
  function confirmReschedule() {
    if (!note.trim()) {
      setRescheduleError('Please give a reason for the reschedule.');
      return;
    }
    reschedule.mutate({
      id: request.id,
      note: note.trim(),
      newDates: rescheduleDates.length ? rescheduleDates : null,
      agentKey: request.agentKey,
      agentName: request.agentName,
      daysCount: request.daysCount,
      year: request.year,
    });
    cancelPending();
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.name}>
          {request.agentName}
          {request.isEmergency && <span className={styles.emergencyTag}>🚨 Emergency</span>}
        </div>
        <div className={styles.meta}>
          {request.daysCount} day{request.daysCount === 1 ? '' : 's'} &middot; {dateRangeLabel(request)}
        </div>
        {request.letterText && (
          <button type="button" className={styles.letterBtn} disabled={downloadLetter.isPending} onClick={() => downloadLetter.mutate(request)}>
            {downloadLetter.isPending ? 'Preparing…' : '📄 Leave request letter'}
          </button>
        )}
        {request.isEmergency && (
          <label className={styles.deductRow}>
            <input type="checkbox" checked={deductQuota} onChange={(e) => setDeductQuota(e.target.checked)} />
            Count against annual quota
          </label>
        )}
        {pendingAction === 'decline' && (
          <div className={styles.noteBox}>
            <textarea className={styles.textarea} placeholder="Reason for declining (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className={styles.inlineActions}>
              <button type="button" className={styles.declineBtn} onClick={cancelPending}>
                Cancel
              </button>
              <button type="button" className={styles.approveBtn} disabled={busy} onClick={confirmDecline}>
                {decide.isPending ? 'Saving…' : 'Confirm decline'}
              </button>
            </div>
          </div>
        )}
        {pendingAction === 'reschedule' && (
          <div className={styles.noteBox}>
            <textarea className={styles.textarea} placeholder="Reason for reschedule (required)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className={styles.rescheduleDateRow}>
              <input className={styles.input} type="date" value={newDateInput} onChange={(e) => setNewDateInput(e.target.value)} />
              <button type="button" className={styles.letterBtn} onClick={addRescheduleDate} disabled={!newDateInput}>
                + Add date
              </button>
            </div>
            {rescheduleDates.length > 0 ? (
              <div className={styles.dateChips}>
                {rescheduleDates.map((d) => (
                  <span key={d} className={styles.dateChip}>
                    {d}
                    <button type="button" onClick={() => setRescheduleDates((prev) => prev.filter((x) => x !== d))} aria-label={`Remove ${d}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className={styles.hint}>No new dates entered yet — confirming without any just asks {request.agentName.split(' ')[0]} to pick fresh dates themselves.</p>
            )}
            {rescheduleError && <p className={styles.error}>{rescheduleError}</p>}
            <div className={styles.inlineActions}>
              <button type="button" className={styles.declineBtn} onClick={cancelPending}>
                Cancel
              </button>
              <button type="button" className={styles.approveBtn} disabled={busy} onClick={confirmReschedule}>
                {reschedule.isPending ? 'Saving…' : rescheduleDates.length ? 'Reschedule & approve' : 'Ask to reschedule'}
              </button>
            </div>
          </div>
        )}
      </div>
      {!pendingAction && (
        <div className={styles.decideActions}>
          <button type="button" className={styles.approveBtn} disabled={busy} onClick={approve}>
            Approve
          </button>
          <button type="button" className={styles.declineBtn} disabled={busy} onClick={() => setPendingAction('decline')}>
            Decline
          </button>
          <button type="button" className={styles.declineBtn} disabled={busy} onClick={() => setPendingAction('reschedule')}>
            Reschedule
          </button>
        </div>
      )}
    </div>
  );
}
