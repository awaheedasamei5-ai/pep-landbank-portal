"use client";

import Link from 'next/link';
import { FileText, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {request.daysCount} day{request.daysCount === 1 ? '' : 's'} &middot; {firstDate}
          {lastDate !== firstDate ? ` to ${lastDate}` : ''}
        </div>
        <div className="mt-1 flex flex-wrap gap-3">
          {request.letterText && (
            <Button variant="link" size="sm" className="h-auto px-0" disabled={downloadLetter.isPending} onClick={() => downloadLetter.mutate(request)}>
              <FileText className="size-3.5" />
              {downloadLetter.isPending ? 'Preparing…' : 'Leave request letter'}
            </Button>
          )}
          <Link href={`/dashboard/leave/requests/${request.id}`} className="text-sm font-medium text-primary hover:underline">
            View details →
          </Link>
        </div>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Send to Management now" disabled={sendPlanned.isPending} onClick={() => sendPlanned.mutate(request.id)}>
          <Send />
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Delete request">
              <Trash2 />
            </Button>
          }
          title="Delete this planned leave?"
          description="This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => remove.mutateAsync(request.id)}
        />
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
        <Link href={`/dashboard/leave/requests/${request.id}`} className={styles.letterBtn}>
          View details →
        </Link>
      </div>
      <span className={styles[STATUS_CLASS[request.status]]}>{STATUS_LABEL[request.status]}</span>
    </div>
  );
}
