"use client";

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useDeletePlannedLeave, useLeaveRequestLogs, useLeaveRequests, useSendPlannedLeave } from '../hooks/useLeaveRequests';
import { useDownloadLeaveLetterPdf } from '../hooks/useLeaveLetterPdf';
import { fmtLongDate } from '../../../shared/lib/format';
import styles from './LeaveRequestDetailScreen.module.css';

const STATUS_LABEL: Record<string, string> = { planned: 'Planned — not sent yet', pending: 'Pending', approved: 'Approved', declined: 'Declined', rescheduled: 'Reschedule requested' };

function actorLabel(actorKey: string | null, agentKey: string): string {
  if (!actorKey) return 'System';
  return actorKey === agentKey ? 'You' : 'Management';
}

// Real request detail page -- a dedicated route per request (letter
// download, the full leave_request_logs status history, which nothing
// read before this, and edit/send/delete while still 'planned') instead
// of everything squeezed into a single list row.
export function LeaveRequestDetailScreen() {
  const router = useRouter();
  const { id: requestId } = useParams<{ id: string }>();
  const profile = useSessionStore((s) => s.profile);
  const { data: requests, isLoading } = useLeaveRequests();
  const { data: logs } = useLeaveRequestLogs(requestId);
  const downloadLetter = useDownloadLeaveLetterPdf();
  const sendPlanned = useSendPlannedLeave();
  const remove = useDeletePlannedLeave();

  const request = (requests ?? []).find((r) => r.id === requestId);
  const isMine = request && profile && request.agentKey === profile.key;

  function del() {
    if (!request) return;
    if (window.confirm("Delete this planned leave? This can't be undone.")) {
      remove.mutate(request.id, { onSuccess: () => router.push('/dashboard/leave/requests') });
    }
  }

  if (isLoading) return <div className={styles.wrap}><p className={styles.hint}>Loading…</p></div>;
  if (!request) {
    return (
      <div className={styles.wrap}>
        <Link href="/dashboard/leave/requests" className={styles.backLink}>
          ← My requests
        </Link>
        <p className={styles.hint}>Request not found.</p>
      </div>
    );
  }

  const firstDate = request.dates[0] ?? '';
  const lastDate = request.dates[request.dates.length - 1] ?? '';

  return (
    <div className={styles.wrap}>
      <Link href="/dashboard/leave/requests" className={styles.backLink}>
        ← My requests
      </Link>

      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>
            {request.daysCount} day{request.daysCount === 1 ? '' : 's'} {request.isEmergency && <span className={styles.emergencyTag}>🚨 Emergency</span>}
          </h1>
          <p className={styles.sub}>
            {fmtLongDate(firstDate)}
            {lastDate !== firstDate ? ` to ${fmtLongDate(lastDate)}` : ''} &middot; {request.year}
          </p>
        </div>
        <span className={styles.statusTag}>{STATUS_LABEL[request.status] ?? request.status}</span>
      </div>

      {request.rescheduleNote && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Note from Management</div>
          <p className={styles.noteText}>{request.rescheduleNote}</p>
        </div>
      )}

      {request.status === 'approved' && !request.deductQuota && <p className={styles.hint}>Not counted against the annual quota (Management's call).</p>}

      <div className={styles.actions}>
        {request.letterText && (
          <button type="button" className={styles.letterBtn} disabled={downloadLetter.isPending} onClick={() => downloadLetter.mutate(request)}>
            {downloadLetter.isPending ? 'Preparing…' : '📄 Leave request letter'}
          </button>
        )}
        {isMine && request.status === 'planned' && (
          <>
            <Link href={`/dashboard/leave/requests/${request.id}/edit`} className={styles.editBtn}>
              Edit dates
            </Link>
            <button type="button" className={styles.sendBtn} disabled={sendPlanned.isPending} onClick={() => sendPlanned.mutate(request.id)}>
              {sendPlanned.isPending ? 'Sending…' : 'Send to Management now'}
            </button>
            <button type="button" className={styles.deleteBtn} disabled={remove.isPending} onClick={del}>
              Delete
            </button>
          </>
        )}
      </div>

      <div className={styles.cardTitle}>History</div>
      <div className={styles.timeline}>
        {(logs ?? []).length === 0 && <p className={styles.hint}>No history yet.</p>}
        {(logs ?? []).map((log) => (
          <div className={styles.timelineRow} key={log.id}>
            <div className={styles.timelineDot} />
            <div className={styles.timelineBody}>
              <div className={styles.timelineLine}>
                {log.fromStatus ? (
                  <>
                    {STATUS_LABEL[log.fromStatus] ?? log.fromStatus} → {STATUS_LABEL[log.toStatus] ?? log.toStatus}
                  </>
                ) : (
                  <>Created as {STATUS_LABEL[log.toStatus] ?? log.toStatus}</>
                )}
                {' '}· {actorLabel(log.actorKey, request.agentKey)}
              </div>
              {log.note && <div className={styles.timelineNote}>&ldquo;{log.note}&rdquo;</div>}
              <div className={styles.timelineDate}>{new Date(log.createdAt).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
