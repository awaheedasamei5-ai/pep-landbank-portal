import { Fragment, useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useCanDecideLeave, useConfirmLeaveUsed, useCreateLeaveRequest, useDecideLeaveRequest, useDeletePlannedLeave, useLeaveRequests, useRescheduleLeaveRequest, useSendPlannedLeave } from '../hooks/useLeaveRequests';
import { useDownloadLeaveLetterPdf } from '../hooks/useLeaveLetterPdf';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { LeaveBalanceRing } from '../components/LeaveBalanceRing';
import { buildLeaveLetterText } from '../lib/leaveLetterPdf';
import { leaveDatesConflictReason, leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved, leaveNeedingUsageConfirmation, leavePlannedDueSoon } from '../lib/leaveLogic';
import { isWeekendIso } from '../../../shared/lib/ghanaHolidays';
import { today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';
import styles from './LeaveHomeScreen.module.css';

// Real table `leave_requests` (confirmed live): SELECT RLS is genuinely
// open to any signed-in staff member (not agent/manager-scoped), matching
// index.html's own cross-staff "who's on leave" checks -- so this list is
// company-wide for everyone, not "my requests". A 'planned' row is the one
// exception: it's v1's real private draft, only ever meant for its own
// owner's eyes until they send it on, so it's filtered out of every other
// viewer's list client-side (nothing in the RLS layer hides it -- see
// PLANNED_STATUS below). The quota-tracking calendar engine (Ghana public
// holidays, colleague-conflict blocking, days-remaining) is a real,
// faithful port (see features/leave/lib/leaveLogic.ts,
// shared/lib/ghanaHolidays.ts). Emergency leave (12.4), the decline/
// reschedule-with-reason + audit-event flow (also 12.4), and the private
// Draft/"planned" save-now-send-later stage (12.1, ported from v1's real
// 'planned' status) were all closed 2026-09-05.
export function LeaveHomeScreen() {
  const { data: requests, isLoading } = useLeaveRequests();
  const canDecide = useCanDecideLeave();
  const profile = useSessionStore((s) => s.profile);
  const myKey = profile?.key ?? '';
  const [showForm, setShowForm] = useState(false);
  const [showEmergencyForm, setShowEmergencyForm] = useState(false);

  const all = requests ?? [];
  const myPlanned = all.filter((r) => r.status === 'planned' && r.agentKey === myKey).sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''));
  const visible = all.filter((r) => r.status !== 'planned');
  const dueSoon = leavePlannedDueSoon(all, myKey, today());
  const needsUsageConfirmation = leaveNeedingUsageConfirmation(all, myKey, today());

  const sorted = [...visible].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const firstDecidedIndex = sorted.findIndex((r) => r.status !== 'pending');

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.sub}>{visible.length} total, company-wide</p>
        <div className={styles.headBtns}>
          {/* Master Spec 12.4: "Emergency Leave button is always visible." */}
          <button
            type="button"
            className={styles.emergencyBtn}
            onClick={() => {
              setShowEmergencyForm((v) => !v);
              setShowForm(false);
            }}
          >
            {showEmergencyForm ? 'Cancel' : '🚨 Emergency Leave'}
          </button>
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => {
              setShowForm((v) => !v);
              setShowEmergencyForm(false);
            }}
          >
            {showForm ? 'Cancel' : '+ Request leave'}
          </button>
        </div>
      </div>

      {showEmergencyForm && <EmergencyLeaveForm requests={all} onDone={() => setShowEmergencyForm(false)} />}
      {showForm && <NewLeaveForm requests={all} onDone={() => setShowForm(false)} />}

      {/* Port of v1's leavePlannedDueSoonList() nudge (index.html:23705-23708). */}
      {dueSoon.map((r) => (
        <DueSoonBanner key={r.id} request={r} />
      ))}

      {/* User correction 2026-09-05: leave only counts as "used" once the
          staff member actively confirms they took it, not just because it
          was approved -- see leaveLogic.ts's leaveNeedingUsageConfirmation. */}
      {needsUsageConfirmation.map((r) => (
        <UsageConfirmationBanner key={r.id} request={r} />
      ))}

      {myPlanned.length > 0 && (
        <>
          <div className={styles.sectitle}>Planned</div>
          <div className={styles.list}>
            {myPlanned.map((r) => (
              <PlannedLeaveRow key={r.id} request={r} />
            ))}
          </div>
        </>
      )}

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {visible.length === 0 && myPlanned.length === 0 && !isLoading && <p style={{ color: 'var(--c-muted)' }}>No leave requests yet.</p>}

      <div className={styles.list}>
        {sorted.map((r, i) => (
          <Fragment key={r.id}>
            {i === 0 && r.status === 'pending' && <div className={styles.sectitle}>Pending</div>}
            {i === firstDecidedIndex && <div className={styles.sectitle}>Decided</div>}
            <LeaveRow request={r} canDecide={canDecide} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function DueSoonBanner({ request }: { request: LeaveRequest }) {
  const sendPlanned = useSendPlannedLeave();
  const firstDate = request.dates[0] ?? '';
  return (
    <div className={styles.dueSoonBanner}>
      <span>Your planned leave starting {firstDate} is coming up — tap to send this request to Management now.</span>
      <button type="button" className={styles.dueSoonBtn} disabled={sendPlanned.isPending} onClick={() => sendPlanned.mutate(request.id)}>
        {sendPlanned.isPending ? 'Sending…' : 'Send now'}
      </button>
    </div>
  );
}

function UsageConfirmationBanner({ request }: { request: LeaveRequest }) {
  const confirmUsed = useConfirmLeaveUsed();
  const firstDate = request.dates[0] ?? '';
  const lastDate = request.dates[request.dates.length - 1] ?? '';
  return (
    <div className={styles.dueSoonBanner}>
      <span>
        Did you take your approved leave ({firstDate}
        {lastDate !== firstDate ? ` to ${lastDate}` : ''})? Confirm it so it counts against your yearly total.
      </span>
      <button type="button" className={styles.dueSoonBtn} disabled={confirmUsed.isPending} onClick={() => confirmUsed.mutate(request)}>
        {confirmUsed.isPending ? 'Confirming…' : 'Yes, I took it'}
      </button>
    </div>
  );
}

// v1's real planned-leave row: "Planned — not sent yet" tag, send-on-demand,
// and an outright delete (index.html's sendPlannedLeaveNow/delete-planned
// confirm) since nothing has reached Management yet to decide about.
function PlannedLeaveRow({ request }: { request: LeaveRequest }) {
  const sendPlanned = useSendPlannedLeave();
  const remove = useDeletePlannedLeave();
  const downloadLetter = useDownloadLeaveLetterPdf();
  const firstDate = request.dates[0] ?? '';
  const lastDate = request.dates[request.dates.length - 1] ?? '';

  function del() {
    if (window.confirm("Delete this planned leave? This can't be undone.")) remove.mutate(request.id);
  }

  return (
    <div className={styles.row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.name}>{request.agentName}</div>
        <div className={styles.meta}>
          {request.daysCount} day{request.daysCount === 1 ? '' : 's'} &middot; {firstDate}
          {lastDate !== firstDate ? ` to ${lastDate}` : ''}
        </div>
        {request.letterText && (
          <button type="button" className={styles.letterBtn} disabled={downloadLetter.isPending} onClick={() => downloadLetter.mutate(request)}>
            {downloadLetter.isPending ? 'Preparing…' : '📄 Leave request letter'}
          </button>
        )}
      </div>
      <div className={styles.decideActions}>
        <button type="button" className={styles.approveBtn} disabled={sendPlanned.isPending} onClick={() => sendPlanned.mutate(request.id)}>
          {sendPlanned.isPending ? 'Sending…' : 'Send to Management now'}
        </button>
        <button type="button" className={styles.declineBtn} disabled={remove.isPending} onClick={del}>
          Delete
        </button>
      </div>
      <span className={styles.pendingTag}>Planned — not sent yet</span>
    </div>
  );
}

function NewLeaveForm({ requests, onDone }: { requests: LeaveRequest[]; onDone: () => void }) {
  const create = useCreateLeaveRequest();
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const [year, setYear] = useState(() => new Date(today()).getFullYear());
  const [month, setMonth] = useState(() => new Date(today()).getMonth());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleDate(iso: string) {
    setSelectedDates((prev) => (prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso]));
    setError(null);
  }

  function navMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setMonth(m);
    setYear(y);
  }

  const agentKey = profile?.key ?? '';
  const remaining = config ? leaveDaysRemaining(config, requests, agentKey, year) : null;
  const reserved = config ? leaveDaysReserved(requests, agentKey, year) : 0;
  const confirmedUsed = leaveDaysConfirmedUsed(requests, agentKey, year, today());

  async function submit(asDraft: boolean) {
    if (!config || !profile) return;
    if (!selectedDates.length) {
      setError('Pick at least one date first');
      return;
    }
    if (selectedDates.length > (remaining ?? 0)) {
      setError(`That's ${selectedDates.length} day(s), but you only have ${remaining} left for ${year}.`);
      return;
    }
    const conflict = leaveDatesConflictReason(config, requests, selectedDates, agentKey, year);
    if (conflict) {
      setError(`${conflict} Please adjust your selection.`);
      return;
    }
    const dates = selectedDates.slice().sort();
    // v1's regular leave letter is fully auto-generated -- no reason field
    // (see leaveLetterPdf.ts's header comment) -- built fresh here so it
    // always reflects the actual selected dates/year at submit time.
    const letterText = buildLeaveLetterText(profile.name, dates, year, config.quoteCompanyName);
    await create.mutateAsync({ dates, letterText, asDraft });
    onDone();
  }

  return (
    <div className={styles.formCard}>
      {config && <LeaveBalanceRing total={config.leaveTotalDays} reserved={reserved} remaining={remaining ?? 0} confirmedUsed={confirmedUsed} year={year} />}
      {config ? (
        <LeaveCalendar year={year} month={month} onNavMonth={navMonth} requests={requests} agentKey={agentKey} config={config} selectedDates={selectedDates} onToggleDate={toggleDate} />
      ) : (
        <p style={{ color: 'var(--c-muted)' }}>Loading…</p>
      )}
      {selectedDates.length > 0 && <p className={styles.emergencyDaysNote}>A formal leave request letter will be generated for you and sent with this request.</p>}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.formActions}>
        {/* Master Spec 12.1: "save a plan as Draft and later submit it" -- v1's
            real private 'planned' stage, ported as-is (see LeaveScreen's header
            comment and PlannedLeaveRow). */}
        <button type="button" className={styles.draftBtn} disabled={create.isPending || !config} onClick={() => submit(true)}>
          {create.isPending ? 'Saving…' : 'Save as Draft'}
        </button>
        <button type="button" className={styles.submitBtn} disabled={create.isPending || !config} onClick={() => submit(false)}>
          {create.isPending ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </div>
  );
}

// Master Spec 12.4: a simple date-range + reason, deliberately NOT gated
// on the calendar picker's own weekend/holiday/conflict blocking -- "System
// immediately checks conflicts but does not silently reject; it sends to
// Management for approval" means a conflict is a visible warning here,
// never a hard stop. Weekends are still excluded from the actual dates
// counted (leave stays a working-day concept even in an emergency), and
// public holidays inside the range are skipped the same way.
function EmergencyLeaveForm({ requests, onDone }: { requests: LeaveRequest[]; onDone: () => void }) {
  const create = useCreateLeaveRequest();
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const agentKey = profile?.key ?? '';
  const dates: string[] = [];
  if (fromDate && toDate && toDate >= fromDate) {
    const cursor = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      if (!isWeekendIso(iso)) dates.push(iso);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const year = fromDate ? new Date(fromDate).getFullYear() : new Date().getFullYear();
  const conflictWarning = config && dates.length > 0 ? leaveDatesConflictReason(config, requests, dates, agentKey, year) : null;

  async function submit() {
    setError(null);
    if (!reason.trim()) {
      setError('Please give a reason for the emergency leave.');
      return;
    }
    if (dates.length === 0) {
      setError('Pick a valid date range (end date on or after start date).');
      return;
    }
    if (!profile) return;
    // Exact port of v1's emergency-leave letter -- the same auto-generated
    // formal body, with one extra line appended (index.html:24133).
    const letterText = `${buildLeaveLetterText(profile.name, dates, year, config?.quoteCompanyName)}\n\n(Emergency leave — ${reason.trim()})`;
    await create.mutateAsync({ dates, letterText, isEmergency: true });
    onDone();
  }

  return (
    <div className={`${styles.formCard} ${styles.emergencyCard}`}>
      <p className={styles.emergencyHint}>This goes straight to Management for urgent approval, even if it conflicts with a colleague's leave or an entitlement limit — they'll see the conflict and decide.</p>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>From</label>
          <input className={styles.input} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>To</label>
          <input className={styles.input} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Reason (required)</label>
        <textarea className={styles.textarea} placeholder="What's the emergency?" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {dates.length > 0 && <p className={styles.emergencyDaysNote}>{dates.length} working day(s): {dates[0]} to {dates[dates.length - 1]}</p>}
      {conflictWarning && <p className={styles.error}>⚠ {conflictWarning} Management will see this too.</p>}
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.emergencySubmitBtn} disabled={create.isPending} onClick={submit}>
        {create.isPending ? 'Sending…' : 'Send emergency request'}
      </button>
    </div>
  );
}

const STATUS_LABEL: Record<LeaveRequest['status'], string> = { planned: 'Planned — not sent yet', pending: 'Pending', approved: 'Approved', declined: 'Declined', rescheduled: 'Reschedule requested' };
const STATUS_CLASS: Record<LeaveRequest['status'], string> = { planned: styles.pendingTag, pending: styles.pendingTag, approved: styles.approvedTag, declined: styles.declinedTag, rescheduled: styles.pendingTag };

function LeaveRow({ request, canDecide }: { request: LeaveRequest; canDecide: boolean }) {
  const decide = useDecideLeaveRequest();
  const reschedule = useRescheduleLeaveRequest();
  const downloadLetter = useDownloadLeaveLetterPdf();
  const firstDate = request.dates[0] ?? '';
  const lastDate = request.dates[request.dates.length - 1] ?? '';
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
  // Exact port of v1's apiRescheduleLeaveRequest (index.html:5513-5532):
  // a reason is required either way, but new dates are optional -- give
  // them and it approves right away, leave them off and it just asks the
  // staff member to pick fresh ones themselves.
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.name}>
          {request.agentName}
          {request.isEmergency && <span className={styles.emergencyTag}>🚨 Emergency</span>}
        </div>
        <div className={styles.meta}>
          {request.daysCount} day{request.daysCount === 1 ? '' : 's'} &middot; {firstDate}
          {lastDate !== firstDate ? ` to ${lastDate}` : ''}
        </div>
        {request.letterText && (
          <button type="button" className={styles.letterBtn} disabled={downloadLetter.isPending} onClick={() => downloadLetter.mutate(request)}>
            {downloadLetter.isPending ? 'Preparing…' : '📄 Leave request letter'}
          </button>
        )}
        {request.status !== 'pending' && request.decidedByName && (
          <div className={styles.decidedMeta}>
            {STATUS_LABEL[request.status]} by {request.decidedByName}
            {request.rescheduleNote ? ` — ${request.rescheduleNote}` : ''}
            {request.status === 'approved' && !request.deductQuota ? ' · not counted against quota' : ''}
          </div>
        )}
        {request.status === 'pending' && canDecide && request.isEmergency && (
          <label className={styles.deductRow}>
            <input type="checkbox" checked={deductQuota} onChange={(e) => setDeductQuota(e.target.checked)} />
            Count against annual quota
          </label>
        )}
        {pendingAction === 'decline' && (
          <div className={styles.noteBox}>
            <textarea className={styles.textarea} placeholder="Reason for declining (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className={styles.decideActions} style={{ flexDirection: 'row' }}>
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
              <p className={styles.hint}>No new dates entered yet -- confirming without any just asks {request.agentName.split(' ')[0]} to pick fresh dates themselves.</p>
            )}
            {rescheduleError && <p className={styles.error}>{rescheduleError}</p>}
            <div className={styles.decideActions} style={{ flexDirection: 'row' }}>
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
      {request.status === 'pending' && !pendingAction ? (
        canDecide ? (
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
        ) : (
          <span className={styles.pendingTag}>Pending</span>
        )
      ) : (
        !pendingAction && <span className={STATUS_CLASS[request.status]}>{STATUS_LABEL[request.status]}</span>
      )}
    </div>
  );
}
