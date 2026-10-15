"use client";

import { leaveErrorMessage } from '../lib/leaveErrors';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { SubmitButton } from '@/components/submit-button';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { useLeaveConflictDates, useLeaveRequests, useSubmitRescheduledLeave, useUpdatePlannedLeave } from '../hooks/useLeaveRequests';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { companyClosuresForYear, leaveDatesConflictReason } from '../lib/leaveLogic';
import { leaveSelectionYear } from '../lib/leaveDates';
import { today } from '../../../shared/lib/format';

// Edit a still-'planned' draft's dates -- only ever reachable from the
// detail page's own "Edit dates" link, which only shows while status is
// 'planned' (same scope as delete-planned). Reuses the same calendar
// picker as New Request.
export function LeaveRequestEditScreen() {
  const router = useRouter();
  const { id: requestId } = useParams<{ id: string }>();
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
  const { data: companyClosures } = useLeaveHolidays();
  const update = useUpdatePlannedLeave();
  const submitReschedule = useSubmitRescheduledLeave();

  const request = (requests ?? []).find((r) => r.id === requestId);
  const agentKey = profile?.key ?? '';

  const [year, setYear] = useState(() => new Date(today()).getFullYear());
  const [month, setMonth] = useState(() => new Date(today()).getMonth());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const conflictQuery = useLeaveConflictDates(year, requestId);
  const conflictDates = conflictQuery.data ?? [];
  const selectionYear = leaveSelectionYear(selectedDates) ?? year;
  const selectedAvailability = useLeaveConflictDates(selectionYear, requestId);

  useEffect(() => {
    if (request && !initialized) {
      setSelectedDates(request.status === 'rescheduled' ? [] : request.dates);
      const first = request.status === 'rescheduled' ? undefined : request.dates[0];
      if (first) {
        setYear(new Date(first).getFullYear());
        setMonth(new Date(first).getMonth());
      }
      setInitialized(true);
    }
  }, [request, initialized]);

  function toggleDate(iso: string) {
    if (!selectedDates.includes(iso) && leaveSelectionYear([...selectedDates, iso]) === null) {
      setError('Choose replacement dates from one calendar year. Clear your selection before choosing another year.');
      return;
    }
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

  function save() {
    if (!config || !request) return;
    if (!selectedDates.length) {
      setError('Pick at least one date.');
      return;
    }
    if (leaveSelectionYear(selectedDates) === null) {
      setError('Each request must contain valid dates from one calendar year.');
      return;
    }
    if (!request.isEmergency && !selectedAvailability.isSuccess) {
      setError('Team availability could not be checked. Reload Leave and try again before sending these dates.');
      return;
    }
    if (request.status === 'rescheduled' && selectedDates.length !== request.daysCount) {
      setError(`Choose ${request.daysCount} replacement working day${request.daysCount === 1 ? '' : 's'} to keep the reserved allowance unchanged.`);
      return;
    }
    const conflict = leaveDatesConflictReason(config, (requests ?? []).filter((r) => r.id !== request.id), selectedDates, agentKey, selectionYear, companyClosuresForYear(companyClosures ?? [], selectionYear), new Set(selectedAvailability.data ?? []));
    if (conflict && !request.isEmergency) {
      setError(`${conflict} Please adjust your selection.`);
      return;
    }
    const callbacks = {
      onSuccess: () => router.push(`/dashboard/leave/requests/${request.id}`),
      onError: (error: unknown) => setError(leaveErrorMessage(error)),
    };
    if (request.status === 'rescheduled') {
      submitReschedule.mutate({ id: request.id, dates: selectedDates }, callbacks);
    } else {
      update.mutate({ id: request.id, dates: selectedDates.slice().sort() }, callbacks);
    }
  }

  if (!request) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (request.status !== 'planned' && request.status !== 'rescheduled') {
    return (
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href={`/dashboard/leave/requests/${request.id}`}>
            <ArrowLeft />
            Back
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">This request has already been sent and can no longer be edited.</p>
      </div>
    );
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href={`/dashboard/leave/requests/${request.id}`}>
          <ArrowLeft />
          Back
        </Link>
      </Button>
      <PageHeader title={request.status === 'rescheduled' ? 'Choose replacement dates' : 'Edit planned dates'} description={request.status === 'rescheduled' ? `Choose ${request.daysCount} working day${request.daysCount === 1 ? '' : 's'} to send back to Management for a decision.` : 'Update the dates on your saved plan.'} />
      <Card>
        <CardContent>
          {request.status === 'rescheduled' && <p className="mb-4 text-sm text-muted-foreground">Your original letter and emergency reason are retained. Replacement dates are sent as a separate schedule for Management to review.</p>}
          {config && (
            <LeaveCalendar
              year={year}
              month={month}
              onNavMonth={navMonth}
              requests={(requests ?? []).filter((r) => r.id !== request.id)}
              agentKey={agentKey}
              config={config}
              selectedDates={selectedDates}
              onToggleDate={toggleDate}
              companyClosures={companyClosures}
              secureConflictDates={conflictDates}
              isEmergency={request.isEmergency}
            />
          )}
          {conflictQuery.isPending && <p className="mt-2 text-sm text-muted-foreground">Checking team availability…</p>}
          {conflictQuery.isError && <p role="alert" className="mt-2 text-sm text-destructive">Team availability could not be checked. Reload Leave before sending replacement dates.</p>}
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          <SubmitButton type="button" className="mt-4" disabled={!request.isEmergency && !selectedAvailability.isSuccess} loading={update.isPending || submitReschedule.isPending} onClick={save}>
            {request.status === 'rescheduled' ? 'Send dates to Management' : 'Save changes'}
          </SubmitButton>
        </CardContent>
      </Card>
    </div>
  );
}
