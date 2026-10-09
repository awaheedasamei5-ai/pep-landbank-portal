"use client";

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarDays, CalendarPlus, Hourglass, ListChecks, Siren } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { LeaveBalanceCard } from '../components/LeaveBalanceCard';
import { LeaveDashboardCalendar } from '../components/LeaveDashboardCalendar';
import { LeaveRequestsDataTable } from '../components/LeaveRequestsDataTable';
import { DueSoonBanner, UsageConfirmationBanner } from '../components/LeaveBanners';
import { leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved, leaveNeedingUsageConfirmation, leavePlannedDueSoon, leaveUpcomingForAll } from '../lib/leaveLogic';
import { today } from '../../../shared/lib/format';

// Real Leave app home page, rebuilt on the shell's own real shadcn
// component system (Card/Badge/Table/Button -- the same primitives
// Finance/CRM already use) after a direct correction that the earlier
// hand-rolled CSS-module version read as generic AI-tile UI. PageHeader/
// StatCard are ported verbatim from Shreyasmark1/leave-management-system
// (same stack: Next.js App Router + shadcn/ui); LeaveRequestsDataTable
// and LeaveBalanceCard are adapted from that same repo's
// leave-requests-table.tsx / balance-list.tsx to Palmstead's real data
// shape (a single pooled annual quota, not multiple leave types). Docs:
// docs/plans/04-leave-full-app-build-plan.md.
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
  const myPending = mine.filter((r) => r.status === 'pending').length;

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
    <div className="p-4 pb-24 md:p-8">
      <PageHeader
        title="Leave"
        description={`Your ${thisYear} leave at a glance`}
        action={
          <div className="flex flex-wrap gap-2">
            {isManager && (
              <Button asChild variant="outline">
                <Link href="/dashboard/leave/management">Management</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/dashboard/leave/plan">My leave plan</Link>
            </Button>
            <Button asChild variant="destructive">
              <Link href="/dashboard/leave/emergency">
                <Siren />
                Emergency leave
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/leave/requests/new">
                <CalendarPlus />
                Request leave
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Days remaining" value={myRemaining} icon={CalendarDays} />
        <StatCard label="Pending requests" value={myPending} icon={Hourglass} />
        <StatCard label="Confirmed used (all time)" value={myConfirmedUsed} icon={CalendarClock} />
      </div>

      <div className="mb-6">
        {config && <LeaveBalanceCard total={config.leaveTotalDays} reserved={myReserved} remaining={myRemaining} confirmedUsed={myConfirmedUsed} />}
      </div>

      {(dueSoon.length > 0 || needsUsageConfirmation.length > 0) && (
        <div className="mb-6 grid gap-3">
          {dueSoon.map((r) => (
            <DueSoonBanner key={r.id} request={r} />
          ))}
          {needsUsageConfirmation.map((r) => (
            <UsageConfirmationBanner key={r.id} request={r} />
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>{myMonthApproved.length} approved day(s) this view</CardDescription>
          </CardHeader>
          <CardContent>
            {config ? (
              <LeaveDashboardCalendar year={year} month={month} onNavMonth={navMonth} approvedRequests={myMonthApproved} config={config} companyClosures={companyClosures} />
            ) : (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent requests</CardTitle>
            <CardDescription>Your latest leave activity</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/leave/requests">
                  <ListChecks />
                  View all
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <LeaveRequestsDataTable requests={visible.slice(0, 5)} emptyMessage="You have no leave requests yet." />
            )}
          </CardContent>
        </Card>
      </div>

      {isManager && companyUpcoming.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Team leave coming up</CardTitle>
            <CardDescription>Next 7 days, company-wide</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/leave/management">
                  <AlertTriangle />
                  Open Management dashboard
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <LeaveRequestsDataTable requests={companyUpcoming.slice(0, 5).map((u) => u.request)} showAgent emptyMessage="Nobody has leave coming up." />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
