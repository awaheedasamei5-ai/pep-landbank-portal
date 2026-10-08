"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useCreateLeaveRequest, useLeaveRequests } from '../hooks/useLeaveRequests';
import { buildLeaveLetterText } from '../lib/leaveLetterPdf';
import { leaveDatesConflictReason } from '../lib/leaveLogic';
import { isWeekendIso } from '../../../shared/lib/ghanaHolidays';
import styles from '../screens/LeaveScreen.module.css';

// Extracted from LeaveScreen.tsx's real EmergencyLeaveForm -- same logic,
// now its own route (/dashboard/leave/emergency), a deliberately separate
// flow from a normal request both in business logic (can override the
// colleague-overlap block) and now in navigation too.
export function LeaveEmergencyForm() {
  const router = useRouter();
  const create = useCreateLeaveRequest();
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
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
  const conflictWarning = config && dates.length > 0 ? leaveDatesConflictReason(config, all, dates, agentKey, year) : null;

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
    <div className={`${styles.formCard} ${styles.emergencyCard}`}>
      <p className={styles.emergencyHint}>This goes straight to Management for urgent approval, even if it conflicts with a colleague's leave or an entitlement limit — they'll see the conflict and decide.</p>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>From</label>
          <input className={styles.input} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>To</label>
          <input className={styles.input} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Reason (required)</label>
        <textarea className={styles.textarea} placeholder="What's the emergency?" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {dates.length > 0 && <p className={styles.emergencyDaysNote}>{dates.length} working day(s): {dates[0]} to {dates[dates.length - 1]}</p>}
      {conflictWarning && <p className={styles.error}>⚠ {conflictWarning} Management will see this too.</p>}
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.emergencySubmitBtn} disabled={create.isPending} onClick={submit}>
        {create.isPending ? 'Sending…' : 'Send emergency request'}
      </button>
    </div>
  );
}
