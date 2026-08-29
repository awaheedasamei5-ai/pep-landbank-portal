import { Fragment, useState } from 'react';
import { useCanDecideLeave, useCreateLeaveRequest, useDecideLeaveRequest, useLeaveRequests } from '../hooks/useLeaveRequests';
import { today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';
import styles from './LeaveScreen.module.css';

// Real table `leave_requests` (confirmed live): SELECT RLS is genuinely
// open to any signed-in staff member (not agent/manager-scoped), matching
// index.html's own cross-staff "who's on leave" checks -- so this list is
// company-wide for everyone, not "my requests". Deliberately the request/
// decide subset of a much larger real feature: the private annual-
// calendar "planned" stage, emergency leave, deduct-quota toggle,
// reschedule flow, and the signature-on-approval requirement (a per-staff
// digital signature this app has no capture UI for) are all out of scope.
// Date selection is simplified to a start date + day count (a consecutive
// range) rather than the full multi-select calendar picker.
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

      {showForm && <NewLeaveForm onDone={() => setShowForm(false)} />}

      {isLoading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {requests && requests.length === 0 && !isLoading && <p style={{ color: 'var(--muted)' }}>No leave requests yet.</p>}

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

function NewLeaveForm({ onDone }: { onDone: () => void }) {
  const create = useCreateLeaveRequest();
  const [startDate, setStartDate] = useState(today());
  const [days, setDays] = useState(1);
  const [letterText, setLetterText] = useState('');

  async function submit() {
    const dates: string[] = [];
    const d = new Date(`${startDate}T00:00:00`);
    for (let i = 0; i < days; i++) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    await create.mutateAsync({ dates, letterText: letterText || undefined });
    onDone();
  }

  return (
    <div className={styles.formCard}>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Start date</label>
          <input className={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>No. of days</label>
          <input className={styles.input} type="number" min={1} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} />
        </div>
      </div>
      <textarea className={styles.textarea} placeholder="Reason (optional)" value={letterText} onChange={(e) => setLetterText(e.target.value)} />
      <button type="button" className={styles.submitBtn} disabled={create.isPending} onClick={submit}>
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
