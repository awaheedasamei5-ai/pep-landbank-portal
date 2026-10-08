"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { useLeaveRequests, useUpdatePlannedLeave } from '../hooks/useLeaveRequests';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { companyClosuresForYear, leaveDatesConflictReason } from '../lib/leaveLogic';
import { today } from '../../../shared/lib/format';
import styles from './LeaveRequestEditScreen.module.css';

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
      <div className={styles.wrap}>
        <p className={styles.hint}>Loading…</p>
      </div>
    );
  }
  if (request.status !== 'planned') {
    return (
      <div className={styles.wrap}>
        <Link href={`/dashboard/leave/requests/${request.id}`} className={styles.backLink}>
          ← Back
        </Link>
        <p className={styles.hint}>This request has already been sent and can no longer be edited.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <Link href={`/dashboard/leave/requests/${request.id}`} className={styles.backLink}>
        ← Back
      </Link>
      <h1 className={styles.title}>Edit dates</h1>
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
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.saveBtn} disabled={update.isPending} onClick={save}>
        {update.isPending ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
