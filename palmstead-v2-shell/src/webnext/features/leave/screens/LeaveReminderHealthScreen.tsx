"use client";

import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useLeaveReminderHealth, useRetryFailedLeaveReminder } from '../hooks/useLeaveReminders';
import { leaveErrorMessage } from '../lib/leaveErrors';
import type { LeaveSmsStatus } from '../lib/leaveReminderTypes';

const STATUS_LABEL: Record<LeaveSmsStatus, string> = {
  queued: 'Queued', sending: 'Sending', accepted: 'Provider accepted', failed: 'Failed', needs_review: 'Check provider history',
};
const STATUSES: LeaveSmsStatus[] = ['queued', 'sending', 'accepted', 'failed', 'needs_review'];
function timestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Accra' }) : 'Not recorded yet';
}

export function LeaveReminderHealthScreen() {
  const profile = useSessionStore((state) => state.profile);
  const health = useLeaveReminderHealth();
  const retry = useRetryFailedLeaveReminder();
  if (!profile) return <p className="text-sm text-muted-foreground">Loading your profile…</p>;
  if (profile.role !== 'manager') return (
    <Alert><AlertTitle>Management access required</AlertTitle><AlertDescription>This page contains company reminder records. <Link className="underline" href="/dashboard/leave">Return to your leave plan</Link>.</AlertDescription></Alert>
  );
  const scheduler = health.data?.scheduler;
  const schedulerIsCurrent = Boolean(scheduler?.active && scheduler.last_run_at
    && Date.now() - Date.parse(scheduler.last_run_at) < 30 * 60 * 1000
    && scheduler.last_run_status === 'succeeded');

  return (
    <div className="grid gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2"><Link href="/dashboard/leave/management"><ArrowLeft />Management</Link></Button>
        <PageHeader title="Leave reminders" description="Check planned-leave reminders and resolve failed texts. Times are shown in Ghana time."
          action={<Button variant="outline" disabled={health.isFetching} onClick={() => health.refetch()}><RefreshCw />{health.isFetching ? 'Refreshing…' : 'Refresh'}</Button>} />
      </div>
      {health.isError && <Alert variant="destructive"><AlertTitle>Reminder records could not be refreshed</AlertTitle><AlertDescription>{leaveErrorMessage(health.error)} Use Refresh to try again.</AlertDescription></Alert>}
      {retry.isError && <Alert variant="destructive"><AlertTitle>The text could not be queued</AlertTitle><AlertDescription>{leaveErrorMessage(retry.error)}</AlertDescription></Alert>}
      {retry.isSuccess && <Alert><AlertDescription>The failed text is queued again using the current bio-data phone number. It will be processed on the next scheduled run.</AlertDescription></Alert>}
      {health.isPending ? <p className="text-sm text-muted-foreground">Loading reminder records…</p> : health.data && <>
        <Alert variant={schedulerIsCurrent ? 'default' : 'destructive'}>
          <AlertTitle>{schedulerIsCurrent ? 'Reminder schedule is running' : 'Reminder schedule needs attention'}</AlertTitle>
          <AlertDescription>
            Planned leave is checked every 15 minutes and submitted when its first date is within seven days.
            <span className="mt-1 block">Last scheduled run: {timestamp(scheduler?.last_run_at ?? null)} · {scheduler?.last_run_status ?? 'No run recorded'}.</span>
            {!scheduler?.active && <span className="block">Automatic reminder checks are not enabled.</span>}
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader><CardTitle>Text message records</CardTitle><CardDescription>Provider acceptance confirms the SMS service accepted a text; it does not prove handset delivery. Counts include all recorded Leave texts.</CardDescription></CardHeader>
          <CardContent>
            <dl className="mb-5 flex flex-wrap gap-x-8 gap-y-3 border-b pb-5">
              {STATUSES.map((status) => <div key={status}><dt className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</dt><dd className="text-lg font-semibold tabular-nums">{health.data.counts[status] ?? 0}</dd></div>)}
            </dl>
            <p className="mb-4 text-sm text-muted-foreground">Showing up to 50 records, with failed and uncertain sends first. Message text and full phone numbers are kept private.</p>
            {health.data.messages.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No Leave texts have been queued yet. Saving a future plan does not immediately send a text.</p> : <ul className="divide-y">
              {health.data.messages.map((message) => <li key={message.id} className="flex flex-col gap-3 py-4 md:flex-row md:justify-between">
                <div className="min-w-0 space-y-1">
                  <Link href={`/dashboard/leave/requests/${message.request_id}`} className="font-medium underline-offset-4 hover:underline">{message.request_no}</Link>
                  <p className="break-words text-sm">{message.recipient_name} · {message.masked_phone}</p>
                  <p className="text-xs text-muted-foreground">Created {timestamp(message.created_at)} · {message.attempt_count} attempt(s){message.last_retry_at ? ` · Retry requested ${timestamp(message.last_retry_at)}` : ''}</p>
                  {message.last_error && <p className="max-w-prose break-words text-sm text-destructive">{message.last_error}</p>}
                  {message.status === 'needs_review' && <p className="max-w-prose text-sm text-muted-foreground">Check the SMS provider history before taking further action. This text may already have been accepted; it will not be resent automatically.</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-start gap-2">
                  <Badge variant={message.status === 'failed' || message.status === 'needs_review' ? 'destructive' : 'secondary'}>{STATUS_LABEL[message.status]}</Badge>
                  {message.status === 'failed' && <Button size="sm" variant="outline" disabled={retry.isPending} aria-label={`Queue failed text again for ${message.recipient_name}`} onClick={() => retry.mutate(message.id)}>Queue again</Button>}
                </div>
              </li>)}
            </ul>}
          </CardContent>
        </Card>
      </>}
    </div>
  );
}
