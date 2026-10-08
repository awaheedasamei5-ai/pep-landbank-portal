"use client";

import { useConfirmLeaveUsed, useSendPlannedLeave } from '../hooks/useLeaveRequests';
import type { LeaveRequest } from '../../../types/domain';
import styles from '../screens/LeaveScreen.module.css';

export function DueSoonBanner({ request }: { request: LeaveRequest }) {
  const sendPlanned = useSendPlannedLeave();
  const firstDate = request.dates[0] ?? '';
  return (
    <div className={styles.dueSoonBanner}>
      <span>Your planned leave starting {firstDate} is coming up — tap to send this request to Management now.</span>
      <button type="button" className={styles.dueSoonBtn} disabled={sendPlanned.isPending} onClick={() => sendPlanned.mutate(request.id)}>
        {sendPlanned.isPending ? 'Sending…' : 'Send now'}
      </button>
    </div>
  );
}

export function UsageConfirmationBanner({ request }: { request: LeaveRequest }) {
  const confirmUsed = useConfirmLeaveUsed();
  const firstDate = request.dates[0] ?? '';
  const lastDate = request.dates[request.dates.length - 1] ?? '';
  return (
    <div className={styles.dueSoonBanner}>
      <span>
        Did you take your approved leave ({firstDate}
        {lastDate !== firstDate ? ` to ${lastDate}` : ''})? Confirm it so it counts against your yearly total.
      </span>
      <button type="button" className={styles.dueSoonBtn} disabled={confirmUsed.isPending} onClick={() => confirmUsed.mutate(request)}>
        {confirmUsed.isPending ? 'Confirming…' : 'Yes, I took it'}
      </button>
    </div>
  );
}
