"use client";

import { Fragment, useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useConfirmLeaveUsed, useCreateLeaveRequest, useDeletePlannedLeave, useLeaveRequests, useSendPlannedLeave } from '../hooks/useLeaveRequests';
import { useDownloadLeaveLetterPdf } from '../hooks/useLeaveLetterPdf';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { LeaveBalanceRing } from '../components/LeaveBalanceRing';
import { buildLeaveLetterText } from '../lib/leaveLetterPdf';
import { leaveDatesConflictReason, leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved, leaveNeedingUsageConfirmation, leavePlannedDueSoon } from '../lib/leaveLogic';
import { isWeekendIso } from '../../../shared/lib/ghanaHolidays';
import { today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';
import { LeaveManagementScreen } from './LeaveManagementScreen';
import styles from './LeaveScreen.module.css';

const STATUS_LABEL: Record<LeaveRequest['status'], string> = { planned: 'Planned — not sent yet', pending: 'Pending', approved: 'Approved', declined: 'Declined', rescheduled: 'Reschedule requested' };
const STATUS_CLASS: Record<LeaveRequest['status'], string> = { planned: 'pendingTag', pending: 'pendingTag', approved: 'approvedTag', declined: 'declinedTag', rescheduled: 'pendingTag' };

// Plan Part 3, written from the staff member's own seat: request leave,
// see it costed in real days as you pick, get stopped before wasting a
// submission on a bad date, download the real formal letter, and get
// nudged (not left to notice on their own) about a forgotten planned
// draft or an already-passed approved date needing confirmation. Real
// leave_requests SELECT RLS is company-wide, but this screen filters to
// the signed-in staff member's OWN requests only -- the company-wide
// view is Management's own screen (LeaveManagementScreen.tsx), per the
// standing correction that Staff and Management need genuinely separate
// experiences, not one shared list with role-conditional buttons.
export function LeaveScreen() {
  const isManager = useSessionStore((s) => s.profile?.role === 'manager');
  const [view, setView] = useState<'mine' | 'management'>('mine');
  const { data: requests, isLoading } = useLeaveRequests();
  const profile = useSessionStore((s) => s.profile);
  const myKey = profile?.key ?? '';
  const [showForm, setShowForm] = useState(false);
  const [showEmergencyForm, setShowEmergencyForm] = useState(false);

  const all = requests ?? [];
  const mine = all.filter((r) => r.agentKey === myKey);
  const myPlanned = mine.filter((r) => r.status === 'planned').sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''));
  const visible = mine.filter((r) => r.status !== 'planned').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const dueSoon = leavePlannedDueSoon(all, myKey, today());
  const needsUsageConfirmation = leaveNeedingUsageConfirmation(all, myKey, today());

  if (isManager && view === 'management') {
    return (
      <div>
        <div className={styles.viewSwitchOuter}>
          <div className={styles.viewSwitch}>
            <button type="button" className={styles.viewBtn} onClick={() => setView('mine')}>My Leave</button>
            <button type="button" className={styles.viewBtnActive}>Management</button>
          </div>
        </div>
        <LeaveManagementScreen />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {isManager && (
        <div className={styles.viewSwitch}>
          <button type="button" className={styles.viewBtnActive}>My Leave</button>
          <button type="button" className={styles.viewBtn} onClick={() => setView('management')}>Management</button>
        </div>
      )}
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Leave</h1>
          <p className={styles.sub}>{visible.length} request{visible.length === 1 ? '' : 's'} of your own</p>
        </div>
        <div className={styles.headBtns}>
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

      {dueSoon.map((r) => (
        <DueSoonBanner key={r.id} request={r} />
      ))}

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

      {isLoading && <p className={styles.hint}>Loading…</p>}
      {visible.length === 0 && myPlanned.length === 0 && !isLoading && <p className={styles.hint}>No leave requests yet.</p>}

      {visible.length > 0 && (
        <>
          <div className={styles.sectitle}>Your requests</div>
          <div className={styles.list}>
            {visible.map((r) => (
              <Fragment key={r.id}>
                <MyLeaveRow request={r} />
              </Fragment>
            ))}
          </div>
        </>
      )}
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

// V1's real planned-leave row: "Planned — not sent yet" tag, send-on-demand,
// and an outright delete since nothing has reached Management yet to
// decide about.
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
    </div>
  );
}

function MyLeaveRow({ request }: { request: LeaveRequest }) {
  const downloadLetter = useDownloadLeaveLetterPdf();
  const firstDate = request.dates[0] ?? '';
  const lastDate = request.dates[request.dates.length - 1] ?? '';
  return (
    <div className={styles.row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.name}>
          {request.daysCount} day{request.daysCount === 1 ? '' : 's'}
          {request.isEmergency && <span className={styles.emergencyTag}>🚨 Emergency</span>}
        </div>
        <div className={styles.meta}>
          {firstDate}
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
      </div>
      <span className={styles[STATUS_CLASS[request.status]]}>{STATUS_LABEL[request.status]}</span>
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
        <p className={styles.hint}>Loading…</p>
      )}
      {selectedDates.length > 0 && <p className={styles.emergencyDaysNote}>A formal leave request letter will be generated for you and sent with this request.</p>}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.formActions}>
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

// Plan Part 1: emergency leave is the one deliberate exception to the
// colleague-overlap block -- it may overlap another staff member's held
// date, but only with a typed reason, and it still requires Management
// approval. Deliberately NOT gated on the calendar picker's own weekend/
// holiday/conflict blocking: a conflict here is a visible warning,
// never a hard stop. Weekends/holidays are still excluded from the
// actual dates counted -- leave stays a working-day concept even in an
// emergency.
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
