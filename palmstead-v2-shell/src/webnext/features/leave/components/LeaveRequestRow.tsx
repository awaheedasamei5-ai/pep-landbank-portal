"use client";

import { useSendPlannedLeave, useDeletePlannedLeave } from '../hooks/useLeaveRequests';
import { useDownloadLeaveLetterPdf } from '../hooks/useLeaveLetterPdf';
import type { LeaveRequest } from '../../../types/domain';
import styles from '../screens/LeaveScreen.module.css';

export const STATUS_LABEL: Record<LeaveRequest['status'], string> = {
  planned: 'Planned — not sent yet',
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
  rescheduled: 'Reschedule requested',
};
export const STATUS_CLASS: Record<LeaveRequest['status'], string> = {
  planned: 'pendingTag',
  pending: 'pendingTag',
  approved: 'approvedTag',
  declined: 'declinedTag',
  rescheduled: 'pendingTag',
};

// Shared between the Dashboard's "recent" teaser and the full My Requests
// list -- extracted from LeaveScreen.tsx (same real markup/behavior, not
// rewritten) so both pages render identically rather than drifting.
export function PlannedLeaveRow({ request }: { request: LeaveRequest }) {
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

export function MyLeaveRow({ request }: { request: LeaveRequest }) {
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
