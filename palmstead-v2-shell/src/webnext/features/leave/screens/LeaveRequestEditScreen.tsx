"use client";

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
import { useLeaveRequests, useUpdatePlannedLeave } from '../hooks/useLeaveRequests';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { companyClosuresForYear, leaveDatesConflictReason } from '../lib/leaveLogic';
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

  const request = (requests ?? []).find((r) => r.id === requestId);
  const agentKey = profile?.key ?? '';

  const [year, setYear] = useState(() => new Date(today()).getFullYear());
  const [month, setMonth] = useState(() => new Date(today()).getMonth());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (request && !initialized) {
      setSelectedDates(request.dates);
      const first = request.dates[0];
      if (first) {
        setYear(new Date(first).getFullYear());
        setMonth(new Date(first).getMonth());
      }
      setInitialized(true);
    }
  }, [request, initialized]);

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

  function save() {
    if (!config || !request) return;
    if (!selectedDates.length) {
      setError('Pick at least one date.');
      return;
    }
    const conflict = leaveDatesConflictReason(config, (requests ?? []).filter((r) => r.id !== request.id), selectedDates, agentKey, year, companyClosuresForYear(companyClosures ?? [], year));
    if (conflict) {
      setError(`${conflict} Please adjust your selection.`);
      return;
    }
    update.mutate({ id: request.id, dates: selectedDates.slice().sort() }, { onSuccess: () => router.push(`/dashboard/leave/requests/${request.id}`) });
  }

  if (!request) {
    return (
      <div className="p-4 pb-24 md:p-8">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (request.status !== 'planned') {
    return (
      <div className="p-4 pb-24 md:p-8">
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
    <div className="p-4 pb-24 md:p-8">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href={`/dashboard/leave/requests/${request.id}`}>
          <ArrowLeft />
          Back
        </Link>
      </Button>
      <PageHeader title="Edit dates" />
      <Card className="max-w-md">
        <CardContent>
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
            />
          )}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <SubmitButton type="button" className="mt-4" loading={update.isPending} onClick={save}>
            Save changes
          </SubmitButton>
        </CardContent>
      </Card>
    </div>
  );
}
