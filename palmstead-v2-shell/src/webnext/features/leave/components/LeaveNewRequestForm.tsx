"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useCreateLeaveRequest, useLeaveRequests } from '../hooks/useLeaveRequests';
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
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
  const { data: companyClosures } = useLeaveHolidays();
  const monthParam = searchParams.get('month');
  const yearParam = searchParams.get('year');
  const [year, setYear] = useState(() => (yearParam ? Number(yearParam) : new Date(today()).getFullYear()));
  const [month, setMonth] = useState(() => (monthParam ? Number(monthParam) : new Date(today()).getMonth()));
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const all = requests ?? [];

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

  async function submit(asDraft: boolean) {
    if (!config || !profile) return;
    if (!selectedDates.length) {
      setError('Pick at least one date first');
      return;
    }
    if (selectedDates.length > (remaining ?? 0)) {
      setError(`That's ${selectedDates.length} day(s), but you only have ${remaining} left for ${year}.`);
      return;
    }
    const conflict = leaveDatesConflictReason(config, all, selectedDates, agentKey, year, companyClosuresForYear(companyClosures ?? [], year));
    if (conflict) {
      setError(`${conflict} Please adjust your selection.`);
      return;
    }
    const dates = selectedDates.slice().sort();
    const letterText = buildLeaveLetterText(profile.name, dates, year, config.quoteCompanyName);
    await create.mutateAsync({ dates, letterText, asDraft });
    router.push('/dashboard/leave/requests');
  }

  return (
    <div className="grid gap-4">
      {config && <LeaveBalanceCard total={config.leaveTotalDays} reserved={reserved} remaining={remaining ?? 0} confirmedUsed={confirmedUsed} />}
      <Card>
        <CardContent>
          {config ? (
            <LeaveCalendar year={year} month={month} onNavMonth={navMonth} requests={all} agentKey={agentKey} config={config} selectedDates={selectedDates} onToggleDate={toggleDate} companyClosures={companyClosures} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {selectedDates.length > 0 && <p className="mt-3 text-xs text-muted-foreground">A formal leave request letter will be generated for you and sent with this request.</p>}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" disabled={create.isPending || !config} onClick={() => submit(true)}>
              Save as Draft
            </Button>
            <SubmitButton type="button" loading={create.isPending} disabled={!config} onClick={() => submit(false)}>
              Send request
            </SubmitButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
