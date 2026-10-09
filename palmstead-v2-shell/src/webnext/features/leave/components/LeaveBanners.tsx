"use client";

import { BellRing } from 'lucide-react';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { SubmitButton } from '@/components/submit-button';
import { useConfirmLeaveUsed, useSendPlannedLeave } from '../hooks/useLeaveRequests';
import type { LeaveRequest } from '../../../types/domain';

export function DueSoonBanner({ request }: { request: LeaveRequest }) {
  const sendPlanned = useSendPlannedLeave();
  const firstDate = request.dates[0] ?? '';
  return (
    <Alert>
      <BellRing />
      <AlertDescription>Your planned leave starting {firstDate} is coming up — send it to Management now.</AlertDescription>
      <AlertAction>
        <SubmitButton size="sm" loading={sendPlanned.isPending} onClick={() => sendPlanned.mutate(request.id)}>
          Send now
        </SubmitButton>
      </AlertAction>
    </Alert>
  );
}

export function UsageConfirmationBanner({ request }: { request: LeaveRequest }) {
  const confirmUsed = useConfirmLeaveUsed();
  const firstDate = request.dates[0] ?? '';
  const lastDate = request.dates[request.dates.length - 1] ?? '';
  return (
    <Alert>
      <BellRing />
      <AlertDescription>
        Did you take your approved leave ({firstDate}
        {lastDate !== firstDate ? ` to ${lastDate}` : ''})? Confirm it so it counts against your yearly total.
      </AlertDescription>
      <AlertAction>
        <SubmitButton size="sm" loading={confirmUsed.isPending} onClick={() => confirmUsed.mutate(request)}>
          Yes, I took it
        </SubmitButton>
      </AlertAction>
    </Alert>
  );
}
