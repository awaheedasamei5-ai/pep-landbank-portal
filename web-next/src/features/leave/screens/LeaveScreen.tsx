import { Fragment, useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useCanDecideLeave, useCreateLeaveRequest, useDecideLeaveRequest, useLeaveRequests } from '../hooks/useLeaveRequests';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { leaveDatesConflictReason, leaveDaysRemaining, leaveDaysUsed } from '../lib/leaveLogic';
import { today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';
import styles from './LeaveScreen.module.css';

// Real table `leave_requests` (confirmed live): SELECT RLS is genuinely
// open to any signed-in staff member (not agent/manager-scoped), matching
// index.html's own cross-staff "who's on leave" checks -- so this list is
// company-wide for everyone, not "my requests". The quota-tracking
// calendar engine (Ghana public holidays, colleague-conflict blocking,
// days-remaining) is a real, faithful port (see features/leave/lib/
// leaveLogic.ts, shared/lib/ghanaHolidays.ts) -- what's deliberately still
// out of scope is the surrounding workflow: the private annual-calendar
// "planned" (save-now-send-later) stage, emergency leave's deduct-quota
// opt-out, and the reschedule flow. Every request here goes straight to
// 'pending', submitted immediately rather than saved privately first.
export function LeaveScreen() {
  const { data: requests, isLoading } = useLeaveRequests();
  const canDecide = useCanDecideLeave();
  const [showForm, setShowForm] = useState(false);

  const sorted = [...(requests ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const firstDecidedIndex = sorted.findIndex((r) => r.status !== 'pending');

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Leave</h1>
          <p className={styles.sub}>{requests?.length ?? 0} total, company-wide</p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ Request leave'}
        </button>
      </div>

      {showForm && <NewLeaveForm requests={requests ?? []} onDone={() => setShowForm(false)} />}

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {requests && requests.length === 0 && !isLoading && <p style={{ color: 'var(--c-muted)' }}>No leave requests yet.</p>}

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

function NewLeaveForm({ requests, onDone }: { requests: LeaveRequest[]; onDone: () => void }) {
  const create = useCreateLeaveRequest();
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const [year, setYear] = useState(() => new Date(today()).getFullYear());
  const [month, setMonth] = useState(() => new Date(today()).getMonth());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [letterText, setLetterText] = useState('');
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
  const used = config ? leaveDaysUsed(requests, agentKey, year) : 0;

  async function submit() {
    if (!config) return;
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
    await create.mutateAsync({ dates: selectedDates.slice().sort(), letterText: letterText || undefined });
    onDone();
  }

  return (
    <div className={styles.formCard}>
      {config && (
        <div className={styles.quotaRow}>
          <div className={styles.quotaItem}>
            <div className={styles.quotaLabel}>Total days/yr</div>
            <div className={styles.quotaVal}>{config.leaveTotalDays}</div>
          </div>
          <div className={styles.quotaItem}>
            <div className={styles.quotaLabel}>Used in {year}</div>
            <div className={styles.quotaVal}>{used}</div>
          </div>
          <div className={styles.quotaItem}>
            <div className={styles.quotaLabel}>Remaining</div>
            <div className={styles.quotaValStrong}>{remaining}</div>
          </div>
        </div>
      )}
      {config ? (
        <LeaveCalendar year={year} month={month} onNavMonth={navMonth} requests={requests} agentKey={agentKey} config={config} selectedDates={selectedDates} onToggleDate={toggleDate} />
      ) : (
        <p style={{ color: 'var(--c-muted)' }}>Loading…</p>
      )}
      <textarea className={styles.textarea} placeholder="Reason (optional)" value={letterText} onChange={(e) => setLetterText(e.target.value)} />
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.submitBtn} disabled={create.isPending || !config} onClick={submit}>
        {create.isPending ? 'Sending…' : 'Send request'}
      </button>
    </div>
  );
}

function LeaveRow({ request, canDecide }: { request: LeaveRequest; canDecide: boolean }) {
  const decide = useDecideLeaveRequest();
  const firstDate = request.dates[0] ?? '';
  const lastDate = request.dates[request.dates.length - 1] ?? '';

  return (
    <div className={styles.row}>
      <div>
        <div className={styles.name}>{request.agentName}</div>
        <div className={styles.meta}>
          {request.daysCount} day{request.daysCount === 1 ? '' : 's'} &middot; {firstDate}
          {lastDate !== firstDate ? ` to ${lastDate}` : ''}
        </div>
        {request.letterText && <div className={styles.note}>{request.letterText}</div>}
        {request.status !== 'pending' && request.decidedByName && (
          <div className={styles.decidedMeta}>
            {request.status === 'approved' ? 'Approved' : 'Declined'} by {request.decidedByName}
          </div>
        )}
      </div>
      {request.status === 'pending' ? (
        canDecide ? (
          <div className={styles.decideActions}>
            <button type="button" className={styles.approveBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: request.id, approve: true })}>
              Approve
            </button>
            <button type="button" className={styles.declineBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: request.id, approve: false })}>
              Decline
            </button>
          </div>
        ) : (
          <span className={styles.pendingTag}>Pending</span>
        )
      ) : (
        <span className={request.status === 'approved' ? styles.approvedTag : styles.declinedTag}>{request.status === 'approved' ? 'Approved' : 'Declined'}</span>
      )}
    </div>
  );
}
