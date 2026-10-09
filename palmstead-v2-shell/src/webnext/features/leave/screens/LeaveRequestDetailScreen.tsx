"use client";

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Pencil, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '../components/StatusBadge';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useDeletePlannedLeave, useLeaveRequestLogs, useLeaveRequests, useSendPlannedLeave } from '../hooks/useLeaveRequests';
import { useDownloadLeaveLetterPdf } from '../hooks/useLeaveLetterPdf';
import { fmtLongDate } from '../../../shared/lib/format';

const STATUS_LABEL: Record<string, string> = { planned: 'Planned — not sent yet', pending: 'Pending', approved: 'Approved', declined: 'Declined', rescheduled: 'Reschedule requested' };

function actorLabel(actorKey: string | null, agentKey: string): string {
  if (!actorKey) return 'System';
  return actorKey === agentKey ? 'You' : 'Management';
}

// Real request detail page, rebuilt on the shell's real shadcn components
// -- letter download, the full leave_request_logs status history (which
// nothing read before this), and edit/send/delete while still 'planned'.
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

  if (isLoading) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (!request) {
    return (
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/dashboard/leave/requests">
            <ArrowLeft />
            My requests
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Request not found.</p>
      </div>
    );
  }

  const firstDate = request.dates[0] ?? '';
  const lastDate = request.dates[request.dates.length - 1] ?? '';

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/leave/requests">
          <ArrowLeft />
          My requests
        </Link>
      </Button>

      <PageHeader
        title={`${request.daysCount} day${request.daysCount === 1 ? '' : 's'}`}
        description={`${fmtLongDate(firstDate)}${lastDate !== firstDate ? ` to ${fmtLongDate(lastDate)}` : ''} · ${request.year}${request.requestNo ? ` · ${request.requestNo}` : ''}`}
        action={<StatusBadge status={request.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="grid gap-4 self-start xl:col-span-7">
          {request.rescheduleNote && (
            <Alert>
              <AlertDescription>
                <span className="font-medium text-foreground">Note from Management:</span> {request.rescheduleNote}
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardContent className="grid gap-4 pt-6">
              {request.status === 'approved' && !request.deductQuota && <p className="text-sm text-muted-foreground">Not counted against the annual quota (Management&apos;s call).</p>}
              <div className="flex flex-wrap gap-2">
                {request.letterText && (
                  <Button variant="outline" disabled={downloadLetter.isPending} onClick={() => downloadLetter.mutate(request)}>
                    <FileText />
                    {downloadLetter.isPending ? 'Preparing…' : 'Leave request letter'}
                  </Button>
                )}
                {isMine && request.status === 'planned' && (
                  <>
                    <Button asChild variant="outline">
                      <Link href={`/dashboard/leave/requests/${request.id}/edit`}>
                        <Pencil />
                        Edit dates
                      </Link>
                    </Button>
                    <Button disabled={sendPlanned.isPending} onClick={() => sendPlanned.mutate(request.id)}>
                      <Send />
                      {sendPlanned.isPending ? 'Sending…' : 'Send to Management now'}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="destructive">
                          <Trash2 />
                          Delete
                        </Button>
                      }
                      title="Delete this planned leave?"
                      description="This can't be undone."
                      confirmLabel="Delete"
                      onConfirm={() => remove.mutateAsync(request.id).then(() => router.push('/dashboard/leave/requests'))}
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              {(logs ?? []).length === 0 && <p className="text-sm text-muted-foreground">No history yet.</p>}
              <div className="grid gap-4">
                {(logs ?? []).map((log) => (
                  <div key={log.id} className="flex gap-3 border-l-2 pl-3">
                    <div className="grid gap-0.5">
                      <div className="text-sm font-medium">
                        {log.fromStatus ? (
                          <>
                            {STATUS_LABEL[log.fromStatus] ?? log.fromStatus} → {STATUS_LABEL[log.toStatus] ?? log.toStatus}
                          </>
                        ) : (
                          <>Created as {STATUS_LABEL[log.toStatus] ?? log.toStatus}</>
                        )}
                        <span className="font-normal text-muted-foreground"> · {actorLabel(log.actorKey, request.agentKey)}</span>
                      </div>
                      {log.note && <div className="text-sm text-muted-foreground italic">&ldquo;{log.note}&rdquo;</div>}
                      <div className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
