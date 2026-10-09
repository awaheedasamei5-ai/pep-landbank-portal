"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/page-header';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { LeaveRequestsDataTable } from '../components/LeaveRequestsDataTable';
import { PlannedRowActions } from '../components/PlannedRowActions';
import type { LeaveRequest } from '../../../types/domain';

const ALL_STATUSES: LeaveRequest['status'][] = ['planned', 'pending', 'approved', 'declined', 'rescheduled'];
const STATUS_FILTER_LABEL: Record<LeaveRequest['status'], string> = {
  planned: 'Planned',
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
  rescheduled: 'Rescheduled',
};

// Real filterable history page, rebuilt on the shell's real shadcn Select
// + Table (Shreyasmark1/leave-management-system's ApprovalsView filter
// pattern, adapted to a single-user "my requests" view).
export function LeaveRequestsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = (searchParams.get('status') as LeaveRequest['status'] | null) ?? 'all';
  const yearFilter = searchParams.get('year') ?? 'all';

  const profile = useSessionStore((s) => s.profile);
  const myKey = profile?.key ?? '';
  const { data: requests, isLoading } = useLeaveRequests();

  const all = requests ?? [];
  const mine = all.filter((r) => r.agentKey === myKey);
  const years = Array.from(new Set(mine.map((r) => String(r.year)))).sort().reverse();

  let filtered = mine;
  if (statusFilter !== 'all') filtered = filtered.filter((r) => r.status === statusFilter);
  if (yearFilter !== 'all') filtered = filtered.filter((r) => String(r.year) === yearFilter);
  filtered = filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    router.push(`/dashboard/leave/requests${next.toString() ? `?${next.toString()}` : ''}`);
  }

  return (
    <div className="p-4 pb-24 md:p-8">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/leave">
          <ArrowLeft />
          Dashboard
        </Link>
      </Button>
      <PageHeader title="My requests" description={`${filtered.length} request${filtered.length === 1 ? '' : 's'}${statusFilter !== 'all' ? ` · ${STATUS_FILTER_LABEL[statusFilter]}` : ''}`} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={(v) => setParam('status', v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_FILTER_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={(v) => setParam('year', v)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All years" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <LeaveRequestsDataTable requests={filtered} actionSlot={(r) => <PlannedRowActions request={r} />} emptyMessage="No matching requests." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
