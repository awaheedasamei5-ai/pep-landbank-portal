"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useCreateLeaveRequest, useLeaveRequests } from '../hooks/useLeaveRequests';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { LeaveCalendar } from './LeaveCalendar';
import { LeaveBalanceRing } from './LeaveBalanceRing';
import { buildLeaveLetterText } from '../lib/leaveLetterPdf';
import { companyClosuresForYear, leaveDatesConflictReason, leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved } from '../lib/leaveLogic';
import { today } from '../../../shared/lib/format';
import styles from '../screens/LeaveScreen.module.css';

// Extracted from LeaveScreen.tsx's real NewLeaveForm -- same logic, now its
// own route (/dashboard/leave/requests/new) instead of an inline toggle on
// the dashboard, per the standing "when I click this it opens another
// page" instruction.
export function LeaveNewRequestForm() {
  const router = useRouter();
  const create = useCreateLeaveRequest();
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
  const { data: companyClosures } = useLeaveHolidays();
  const [year, setYear] = useState(() => new Date(today()).getFullYear());
  const [month, setMonth] = useState(() => new Date(today()).getMonth());
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
    <div className={styles.formCard}>
      {config && <LeaveBalanceRing total={config.leaveTotalDays} reserved={reserved} remaining={remaining ?? 0} confirmedUsed={confirmedUsed} year={year} />}
      {config ? (
        <LeaveCalendar year={year} month={month} onNavMonth={navMonth} requests={all} agentKey={agentKey} config={config} selectedDates={selectedDates} onToggleDate={toggleDate} companyClosures={companyClosures} />
      ) : (
        <p className={styles.hint}>Loading…</p>
      )}
      {selectedDates.length > 0 && <p className={styles.emergencyDaysNote}>A formal leave request letter will be generated for you and sent with this request.</p>}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.formActions}>
        <button type="button" className={styles.draftBtn} disabled={create.isPending || !config} onClick={() => submit(true)}>
          {create.isPending ? 'Saving…' : 'Save as Draft'}
        </button>
        <button type="button" className={styles.submitBtn} disabled={create.isPending || !config} onClick={() => submit(false)}>
          {create.isPending ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </div>
  );
}
