"use client";

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, FileText, Settings, Siren, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { SubmitButton } from '@/components/submit-button';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useDecideLeaveRequest, useLeaveRequests, useRescheduleLeaveRequest } from '../hooks/useLeaveRequests';
import { useDownloadLeaveLetterPdf } from '../hooks/useLeaveLetterPdf';
import { LeaveRequestsDataTable } from '../components/LeaveRequestsDataTable';
import { leaveUpcomingForAll } from '../lib/leaveLogic';
import { fmtLongDate, today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';

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

// Plan Part 4, rebuilt on the shell's real shadcn components after the
// 2026-10-08 correction -- same AdminOverviewPage composition pattern
// (PageHeader + StatCard row + pending-decisions list) adapted from
// Shreyasmark1/leave-management-system's admin page.
export function LeaveManagementScreen() {
  const { data: roster } = useActiveAgentRoster();
  const { data: requests } = useLeaveRequests();

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

  return (
    <div className="p-4 pb-24 md:p-8">
      <PageHeader
        title="Management"
        description={`Every staff member's ${year} leave plan, at a glance`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/leave/management/requests">Company-wide requests</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/leave/management/calendar">Team calendar</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/leave/management/settings">
                <Settings />
                Settings
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Staff" value={roster?.length ?? 0} icon={Users} />
        <StatCard label="Leave coming up" value={upcoming.length} icon={CalendarClock} />
        <StatCard label="Emergency pending" value={pendingEmergencyCount} icon={AlertTriangle} />
      </div>

      {pending.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Pending decisions</CardTitle>
            <CardDescription>Approve, decline, or reschedule</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {pending.map((r) => (
              <PendingRequestRow key={r.id} request={r} />
            ))}
          </CardContent>
        </Card>
      )}

      {upcoming.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Coming up in the next 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveRequestsDataTable requests={upcoming.map((u) => u.request)} showAgent emptyMessage="Nobody has leave coming up." />
          </CardContent>
        </Card>
      )}

      {emergencies.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Siren className="size-4 text-destructive" />
              Emergency leave
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveRequestsDataTable requests={emergencies} showAgent emptyMessage="No emergency leave on record." />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Every staff member</CardTitle>
          <CardDescription>{roster?.length ?? 0} active staff — per-person countdown, request history, and filters</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/leave/management/requests">
                <FileText />
                Open full roster
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
      </Card>
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
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-56 flex-1">
        <div className="flex items-center gap-2 font-medium">
          {request.agentName}
          {request.isEmergency && <Badge variant="destructive">Emergency</Badge>}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {request.daysCount} day{request.daysCount === 1 ? '' : 's'} &middot; {dateRangeLabel(request)}
        </div>
        {request.letterText && (
          <Button variant="link" size="sm" className="mt-1 h-auto px-0" disabled={downloadLetter.isPending} onClick={() => downloadLetter.mutate(request)}>
            <FileText className="size-3.5" />
            {downloadLetter.isPending ? 'Preparing…' : 'Leave request letter'}
          </Button>
        )}
        {request.isEmergency && (
          <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={deductQuota} onCheckedChange={(v) => setDeductQuota(v === true)} />
            Count against annual quota
          </label>
        )}
        {pendingAction === 'decline' && (
          <div className="mt-3 grid max-w-md gap-2">
            <Textarea placeholder="Reason for declining (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={cancelPending}>
                Cancel
              </Button>
              <SubmitButton size="sm" type="button" loading={decide.isPending} onClick={confirmDecline}>
                Confirm decline
              </SubmitButton>
            </div>
          </div>
        )}
        {pendingAction === 'reschedule' && (
          <div className="mt-3 grid max-w-md gap-2">
            <Textarea placeholder="Reason for reschedule (required)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2">
              <Input type="date" className="flex-1" value={newDateInput} onChange={(e) => setNewDateInput(e.target.value)} />
              <Button variant="outline" size="sm" onClick={addRescheduleDate} disabled={!newDateInput}>
                + Add date
              </Button>
            </div>
            {rescheduleDates.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {rescheduleDates.map((d) => (
                  <Badge key={d} variant="secondary" className="gap-1">
                    {d}
                    <button type="button" onClick={() => setRescheduleDates((prev) => prev.filter((x) => x !== d))} aria-label={`Remove ${d}`} className="hover:text-destructive">
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No new dates entered yet — confirming without any just asks {request.agentName.split(' ')[0]} to pick fresh dates themselves.</p>
            )}
            {rescheduleError && <p className="text-xs text-destructive">{rescheduleError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={cancelPending}>
                Cancel
              </Button>
              <SubmitButton size="sm" type="button" loading={reschedule.isPending} onClick={confirmReschedule}>
                {rescheduleDates.length ? 'Reschedule & approve' : 'Ask to reschedule'}
              </SubmitButton>
            </div>
          </div>
        )}
      </div>
      {!pendingAction && (
        <div className="flex flex-col gap-2">
          <SubmitButton size="sm" type="button" loading={busy} onClick={approve}>
            Approve
          </SubmitButton>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setPendingAction('decline')}>
            Decline
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setPendingAction('reschedule')}>
            Reschedule
          </Button>
        </div>
      )}
    </div>
  );
}
