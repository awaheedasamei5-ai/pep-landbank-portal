"use client";

import { leaveErrorMessage } from '../lib/leaveErrors';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormItem } from '@/components/form-item';
import { SubmitButton } from '@/components/submit-button';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useCreateLeaveRequest, useLeaveConflictDates, useLeaveRequests } from '../hooks/useLeaveRequests';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { buildLeaveLetterText } from '../lib/leaveLetterPdf';
import { companyClosuresForYear, leaveDatesConflictReason } from '../lib/leaveLogic';
import { leaveSelectionYear, leaveWeekdaysInRange } from '../lib/leaveDates';
import { today } from '../../../shared/lib/format';

// Extracted from LeaveScreen.tsx's real EmergencyLeaveForm, rebuilt on
// the shell's real shadcn Card/FormItem (Shreyasmark1/leave-management-
// system's LeaveRequestForm layout pattern) -- a deliberately separate
// flow from a normal request both in business logic (can override the
// colleague-overlap block) and in navigation.
export function LeaveEmergencyForm() {
  const router = useRouter();
  const create = useCreateLeaveRequest();
  const letterReviewId = useId();
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
  const { data: companyClosures } = useLeaveHolidays();
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [letterText, setLetterText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = requests ?? [];
  const agentKey = profile?.key ?? '';
  const dates = leaveWeekdaysInRange(fromDate, toDate);
  const year = leaveSelectionYear([fromDate]) ?? new Date(today()).getFullYear();
  const { data: conflictDates = [] } = useLeaveConflictDates(year);
  const generatedLetter = profile && dates.length
    ? `${buildLeaveLetterText(profile.name, dates, year, config?.quoteCompanyName)}\n\n(Emergency leave — ${reason.trim()})`
    : '';

  useEffect(() => {
    setLetterText(generatedLetter);
  }, [generatedLetter]);
  const conflictWarning = config && dates.length > 0 ? leaveDatesConflictReason(config, all, dates, agentKey, year, companyClosuresForYear(companyClosures ?? [], year), new Set(conflictDates)) : null;

  async function submit() {
    setError(null);
    if (!reason.trim()) {
      setError('Please give a reason for the emergency leave.');
      return;
    }
    if (leaveSelectionYear([fromDate, toDate]) === null) {
      setError('Choose valid dates within one calendar year. Submit a separate request for another year.');
      return;
    }
    if (fromDate < today()) {
      setError('Choose today or a future leave date.');
      return;
    }
    if (dates.length === 0) {
      setError('Pick a valid date range (end date on or after start date).');
      return;
    }
    if (!profile) return;
    try {
      await create.mutateAsync({ dates, letterText: letterText || generatedLetter, isEmergency: true });
      router.push('/dashboard/leave/requests');
    } catch (error) {
      setError(leaveErrorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" />
          Emergency leave
        </CardTitle>
        <CardDescription>This goes straight to Management for urgent approval, even if it conflicts with a colleague's leave or an entitlement limit — they'll see the conflict and decide.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <FormItem label="From" htmlFor={`${letterReviewId}-from`}>
            <Input id={`${letterReviewId}-from`} type="date" min={today()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </FormItem>
          <FormItem label="To" htmlFor={`${letterReviewId}-to`}>
            <Input id={`${letterReviewId}-to`} type="date" min={fromDate || today()} max={/^\d{4}-/.test(fromDate) ? `${fromDate.slice(0, 4)}-12-31` : undefined} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </FormItem>
        </div>
        <FormItem label="Reason (required)" htmlFor={`${letterReviewId}-reason`}>
          <Textarea id={`${letterReviewId}-reason`} placeholder="What's the emergency?" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormItem>
        {dates.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {dates.length} working day(s): {dates[0]} to {dates[dates.length - 1]}
          </p>
        )}
        {conflictWarning && (
          <Alert variant="destructive">
            <AlertDescription>{conflictWarning} Management will see this too.</AlertDescription>
          </Alert>
        )}
        {dates.length > 0 && reason.trim() && (
          <div className="grid gap-2">
            <div>
              <label htmlFor={letterReviewId} className="text-sm font-medium">Review your emergency leave letter</label>
              <p className="text-xs text-muted-foreground">Your reason is included in the generated letter. Review or correct the text before sending.</p>
            </div>
            <Textarea
              id={letterReviewId}
              className="min-h-64 leading-6"
              value={letterText}
              onChange={(event) => setLetterText(event.target.value)}
            />
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <SubmitButton type="button" variant="destructive" disabled={!config || !profile} loading={create.isPending} onClick={submit}>
          Send emergency request
        </SubmitButton>
      </CardContent>
    </Card>
  );
}
