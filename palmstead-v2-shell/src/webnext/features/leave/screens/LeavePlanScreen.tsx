"use client";

import Link from 'next/link';
import { ArrowLeft, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { LeaveBalanceCard } from '../components/LeaveBalanceCard';
import { PlannedLeaveRow } from '../components/LeaveRequestRow';
import { leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved } from '../lib/leaveLogic';
import { today } from '../../../shared/lib/format';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Real "prefill your leave plan for the year" page -- distinct from
// /requests/new (a single one-shot request) and /requests (sent/decided
// history): every still-private 'planned' block for the year, seen
// together, plus a year-at-a-glance strip.
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
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/leave">
          <ArrowLeft />
          Dashboard
        </Link>
      </Button>
      <PageHeader
        title={`My leave plan — ${year}`}
        description="Block out dates across the year before sending anything to Management. Nothing here counts against your quota until sent and decided."
        action={
          <Button asChild>
            <Link href="/dashboard/leave/requests/new">
              <CalendarPlus />
              Add a leave block
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="grid gap-6 xl:col-span-5">
          {config && <LeaveBalanceCard total={config.leaveTotalDays} reserved={reserved} remaining={remaining} confirmedUsed={confirmedUsed} />}
          <Card>
            <CardHeader>
              <CardTitle>Year at a glance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-4">
                {MONTH_NAMES.map((m, i) => (
                  <Link key={m} href={`/dashboard/leave/requests/new?month=${i}&year=${year}`} className="block">
                    <Badge variant={monthsWithPlan.has(i) ? 'default' : 'outline'} className="w-full cursor-pointer justify-center py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground">
                      {m}
                    </Badge>
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Tap a month to block out dates in it.</p>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>Planned blocks</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {planned.length === 0 && <p className="text-sm text-muted-foreground">Nothing planned yet — add a block for any dates you already know you&apos;ll want off this year.</p>}
              {planned.map((r) => (
                <PlannedLeaveRow key={r.id} request={r} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
