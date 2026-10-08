"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { LeaveBalanceRing } from '../components/LeaveBalanceRing';
import { LeaveDashboardCalendar } from '../components/LeaveDashboardCalendar';
import { LeaveStatusCards } from '../components/LeaveStatusCards';
import { DueSoonBanner, UsageConfirmationBanner } from '../components/LeaveBanners';
import { MyLeaveRow } from '../components/LeaveRequestRow';
import { leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved, leaveNeedingUsageConfirmation, leavePlannedDueSoon, leaveUpcomingForAll } from '../lib/leaveLogic';
import { today } from '../../../shared/lib/format';
import styles from './LeaveDashboardScreen.module.css';

// The real Leave app home page -- a genuine dashboard, not a scrolling
// single screen: the countdown as the hero element, a read-only calendar,
// clickable status counts that land on the filtered requests page (the
// "click this, open another page" pattern from the real resource this
// app's page architecture is duplicated from), due-soon/confirmation
// nudges promoted to their own section, and (for managers) a live teaser
// into the team-wide Management dashboard. Docs: docs/plans/
// 04-leave-full-app-build-plan.md.
export function LeaveDashboardScreen() {
  const profile = useSessionStore((s) => s.profile);
  const isManager = profile?.role === 'manager';
  const myKey = profile?.key ?? '';
  const { data: requests, isLoading } = useLeaveRequests();
  const { data: config } = useConfig();
  const { data: companyClosures } = useLeaveHolidays();
  const now = new Date(today());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const all = requests ?? [];
  const mine = all.filter((r) => r.agentKey === myKey);
  const visible = mine.filter((r) => r.status !== 'planned').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const dueSoon = leavePlannedDueSoon(all, myKey, today());
  const needsUsageConfirmation = leaveNeedingUsageConfirmation(all, myKey, today());

  const thisYear = now.getFullYear();
  const myReserved = leaveDaysReserved(all, myKey, thisYear);
  const myRemaining = config ? leaveDaysRemaining(config, all, myKey, thisYear) : 0;
  const myConfirmedUsed = leaveDaysConfirmedUsed(all, myKey, thisYear, today());

  const myMonthApproved = mine.filter((r) => r.status === 'approved');

  const companyUpcoming = isManager ? leaveUpcomingForAll(all.filter((r) => r.status !== 'planned'), today(), 7) : [];

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

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Leave</h1>
          <p className={styles.sub}>Your {thisYear} leave at a glance</p>
        </div>
        <div className={styles.headBtns}>
          {isManager && (
            <Link href="/dashboard/leave/management" className={styles.managementBtn}>
              Management
            </Link>
          )}
          <Link href="/dashboard/leave/emergency" className={styles.emergencyBtn}>
            🚨 Emergency Leave
          </Link>
          <Link href="/dashboard/leave/requests/new" className={styles.addBtn}>
            + Request leave
          </Link>
        </div>
      </div>

      {config && <LeaveBalanceRing total={config.leaveTotalDays} reserved={myReserved} remaining={myRemaining} confirmedUsed={myConfirmedUsed} year={thisYear} />}

      {dueSoon.map((r) => (
        <DueSoonBanner key={r.id} request={r} />
      ))}
      {needsUsageConfirmation.map((r) => (
        <UsageConfirmationBanner key={r.id} request={r} />
      ))}

      <LeaveStatusCards requests={mine} baseHref="/dashboard/leave/requests" />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Calendar</h2>
        {config ? (
          <LeaveDashboardCalendar year={year} month={month} onNavMonth={navMonth} approvedRequests={myMonthApproved} config={config} companyClosures={companyClosures} />
        ) : (
          <p className={styles.hint}>Loading…</p>
        )}
      </div>

      {isManager && companyUpcoming.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeadRow}>
            <h2 className={styles.cardTitle}>Team leave coming up</h2>
            <Link href="/dashboard/leave/management" className={styles.cardLink}>
              Open Management dashboard →
            </Link>
          </div>
          <div className={styles.list}>
            {companyUpcoming.slice(0, 3).map(({ request, startDate }) => (
              <div className={styles.upcomingRow} key={request.id}>
                <span className={styles.upcomingName}>
                  {request.agentName}
                  {request.isEmergency && <span className={styles.emergencyTag}>🚨</span>}
                </span>
                <span className={styles.upcomingDate}>Starts {startDate}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.cardHeadRow}>
        <h2 className={styles.sectitle}>Recent requests</h2>
        <Link href="/dashboard/leave/requests" className={styles.cardLink}>
          View all →
        </Link>
      </div>
      {isLoading && <p className={styles.hint}>Loading…</p>}
      {!isLoading && visible.length === 0 && <p className={styles.hint}>No leave requests yet.</p>}
      {visible.length > 0 && (
        <div className={styles.list}>
          {visible.slice(0, 3).map((r) => (
            <MyLeaveRow key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  );
}
