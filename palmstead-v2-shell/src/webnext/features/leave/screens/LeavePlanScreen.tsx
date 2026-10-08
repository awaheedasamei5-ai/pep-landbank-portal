"use client";

import Link from 'next/link';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { LeaveBalanceRing } from '../components/LeaveBalanceRing';
import { PlannedLeaveRow } from '../components/LeaveRequestRow';
import { leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved } from '../lib/leaveLogic';
import { today } from '../../../shared/lib/format';
import styles from './LeavePlanScreen.module.css';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Real "prefill your leave plan for the year" page -- distinct from
// /requests/new (a single one-shot request) and /requests (sent/decided
// history): this is every still-private 'planned' block for the year,
// seen together, plus a year-at-a-glance strip of which months already
// have something planned, before anything is sent to Management.
export function LeavePlanScreen() {
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
  const myKey = profile?.key ?? '';
  const year = new Date(today()).getFullYear();

  const all = requests ?? [];
  const mine = all.filter((r) => r.agentKey === myKey && r.year === year);
  const planned = mine.filter((r) => r.status === 'planned').sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''));

  const reserved = leaveDaysReserved(all, myKey, year);
  const remaining = config ? leaveDaysRemaining(config, all, myKey, year) : 0;
  const confirmedUsed = leaveDaysConfirmedUsed(all, myKey, year, today());

  const monthsWithPlan = new Set(planned.flatMap((r) => r.dates.map((d) => Number(d.slice(5, 7)) - 1)));

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <Link href="/dashboard/leave" className={styles.backLink}>
          ← Dashboard
        </Link>
        <h1 className={styles.title}>My leave plan — {year}</h1>
        <p className={styles.sub}>Block out dates across the year before sending anything to Management. Nothing here counts against your quota until sent and decided.</p>
      </div>

      {config && <LeaveBalanceRing total={config.leaveTotalDays} reserved={reserved} remaining={remaining} confirmedUsed={confirmedUsed} year={year} />}

      <div className={styles.monthStrip}>
        {MONTH_NAMES.map((m, i) => (
          <div key={m} className={`${styles.monthChip} ${monthsWithPlan.has(i) ? styles.monthPlanned : ''}`}>
            {m}
          </div>
        ))}
      </div>

      <Link href="/dashboard/leave/requests/new" className={styles.addBtn}>
        + Add a leave block
      </Link>

      <div className={styles.sectitle}>Planned blocks</div>
      {planned.length === 0 && <p className={styles.hint}>Nothing planned yet — add a block for any dates you already know you'll want off this year.</p>}
      <div className={styles.list}>
        {planned.map((r) => (
          <PlannedLeaveRow key={r.id} request={r} />
        ))}
      </div>
    </div>
  );
}
