"use client";

import { leaveErrorMessage } from '../lib/leaveErrors';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useCreateLeaveRequest, useLeaveConflictDates, useLeaveRequests } from '../hooks/useLeaveRequests';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { LeaveCalendar } from './LeaveCalendar';
import { LeaveBalanceCard } from './LeaveBalanceCard';
import { buildLeaveLetterText } from '../lib/leaveLetterPdf';
import { companyClosuresForYear, leaveDatesConflictReason, leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved } from '../lib/leaveLogic';
import { today } from '../../../shared/lib/format';

// Extracted from LeaveScreen.tsx's real NewLeaveForm -- same logic, now its
// own route (/dashboard/leave/requests/new), rebuilt on the shell's real
// shadcn Card/Button after the 2026-10-08 correction. LeaveCalendar stays
// a genuinely custom widget (no equivalent in the reference repo or the
// shell's own component library).
export function LeaveNewRequestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const create = useCreateLeaveRequest();
  const letterReviewId = useId();
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
  const { data: companyClosures } = useLeaveHolidays();
  const monthParam = searchParams.get('month');
  const yearParam = searchParams.get('year');
  const [year, setYear] = useState(() => (yearParam ? Number(yearParam) : new Date(today()).getFullYear()));
  const [month, setMonth] = useState(() => (monthParam ? Number(monthParam) : new Date(today()).getMonth()));
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [letterText, setLetterText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = requests ?? [];
  const conflictQuery = useLeaveConflictDates(year);
  const conflictDates = conflictQuery.data ?? [];
  const secureConflicts = new Set(conflictDates);

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
  const remaining = config ? leaveDaysRemaining(config, all, agentKey, year) : null;
  const reserved = config ? leaveDaysReserved(all, agentKey, year) : 0;
  const confirmedUsed = leaveDaysConfirmedUsed(all, agentKey, year, today());
  const sortedDates = selectedDates.slice().sort();
  const generatedLetter = profile && sortedDates.length
    ? buildLeaveLetterText(profile.name, sortedDates, new Date(sortedDates[0]).getFullYear(), config?.quoteCompanyName)
    : '';

  useEffect(() => {
    setLetterText(generatedLetter);
  }, [generatedLetter]);

  async function submit(asDraft: boolean) {
    if (!config || !profile) return;
    if (!selectedDates.length) {
      setError('Pick at least one date first');
      return;
    }
    if (!conflictQuery.isSuccess) {
      setError('Team availability could not be checked. Reload Leave and try again before submitting.');
      return;
    }
    if (selectedDates.length > (remaining ?? 0)) {
      setError(`That's ${selectedDates.length} day(s), but you only have ${remaining} left for ${year}.`);
      return;
    }
    const conflict = leaveDatesConflictReason(config, all, selectedDates, agentKey, year, companyClosuresForYear(companyClosures ?? [], year), secureConflicts);
    if (conflict) {
      setError(`${conflict} Please adjust your selection.`);
      return;
    }
    const dates = sortedDates;
    try {
      await create.mutateAsync({ dates, letterText: letterText || generatedLetter, asDraft });
      router.push('/dashboard/leave/requests');
    } catch (error) {
      setError(leaveErrorMessage(error));
    }
  }

  return (
    <div className="grid gap-4">
      {config && <LeaveBalanceCard total={config.leaveTotalDays} reserved={reserved} remaining={remaining ?? 0} confirmedUsed={confirmedUsed} />}
      <Card>
        <CardContent>
          {config ? (
            <LeaveCalendar year={year} month={month} onNavMonth={navMonth} requests={all} agentKey={agentKey} config={config} selectedDates={selectedDates} onToggleDate={toggleDate} companyClosures={companyClosures} secureConflictDates={conflictDates} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {conflictQuery.isPending && <p className="mt-2 text-sm text-muted-foreground">Checking team availability…</p>}
          {conflictQuery.isError && <p role="alert" className="mt-2 text-sm text-destructive">Team availability could not be checked. Reload Leave before submitting a request.</p>}
          {selectedDates.length > 0 && (
            <div className="mt-4 grid gap-2">
              <div>
                <label htmlFor={letterReviewId} className="text-sm font-medium">Review your leave letter</label>
                <p className="text-xs text-muted-foreground">The letter is prepared from your selected dates. Review or correct it before saving or sending.</p>
              </div>
              <Textarea
                id={letterReviewId}
                className="min-h-64 leading-6"
                value={letterText}
                onChange={(event) => setLetterText(event.target.value)}
                aria-describedby={`${letterReviewId}-help`}
              />
              <p id={`${letterReviewId}-help`} className="sr-only">This is your generated leave request letter. You can edit it before submitting.</p>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" disabled={create.isPending || !config || !conflictQuery.isSuccess} onClick={() => submit(true)}>
              Save as Draft
            </Button>
            <SubmitButton type="button" loading={create.isPending} disabled={!config || !conflictQuery.isSuccess} onClick={() => submit(false)}>
              Send request
            </SubmitButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
