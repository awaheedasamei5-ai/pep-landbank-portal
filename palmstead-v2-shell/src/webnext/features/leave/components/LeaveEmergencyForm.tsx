"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormItem } from '@/components/form-item';
import { SubmitButton } from '@/components/submit-button';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useCreateLeaveRequest, useLeaveRequests } from '../hooks/useLeaveRequests';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { buildLeaveLetterText } from '../lib/leaveLetterPdf';
import { companyClosuresForYear, leaveDatesConflictReason } from '../lib/leaveLogic';
import { isWeekendIso } from '../../../shared/lib/ghanaHolidays';

// Extracted from LeaveScreen.tsx's real EmergencyLeaveForm, rebuilt on
// the shell's real shadcn Card/FormItem (Shreyasmark1/leave-management-
// system's LeaveRequestForm layout pattern) -- a deliberately separate
// flow from a normal request both in business logic (can override the
// colleague-overlap block) and in navigation.
export function LeaveEmergencyForm() {
  const router = useRouter();
  const create = useCreateLeaveRequest();
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
  const { data: companyClosures } = useLeaveHolidays();
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = requests ?? [];
  const agentKey = profile?.key ?? '';
  const dates: string[] = [];
  if (fromDate && toDate && toDate >= fromDate) {
    const cursor = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      if (!isWeekendIso(iso)) dates.push(iso);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const year = fromDate ? new Date(fromDate).getFullYear() : new Date().getFullYear();
  const conflictWarning = config && dates.length > 0 ? leaveDatesConflictReason(config, all, dates, agentKey, year, companyClosuresForYear(companyClosures ?? [], year)) : null;

  async function submit() {
    setError(null);
    if (!reason.trim()) {
      setError('Please give a reason for the emergency leave.');
      return;
    }
    if (dates.length === 0) {
      setError('Pick a valid date range (end date on or after start date).');
      return;
    }
    if (!profile) return;
    const letterText = `${buildLeaveLetterText(profile.name, dates, year, config?.quoteCompanyName)}\n\n(Emergency leave — ${reason.trim()})`;
    await create.mutateAsync({ dates, letterText, isEmergency: true });
    router.push('/dashboard/leave/requests');
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
          <FormItem label="From" htmlFor="fromDate">
            <Input id="fromDate" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </FormItem>
          <FormItem label="To" htmlFor="toDate">
            <Input id="toDate" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </FormItem>
        </div>
        <FormItem label="Reason (required)" htmlFor="reason">
          <Textarea id="reason" placeholder="What's the emergency?" value={reason} onChange={(e) => setReason(e.target.value)} />
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        <SubmitButton type="button" variant="destructive" loading={create.isPending} onClick={submit}>
          Send emergency request
        </SubmitButton>
      </CardContent>
    </Card>
  );
}
