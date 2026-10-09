"use client";

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/page-header';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { LeaveRequestsDataTable } from '../components/LeaveRequestsDataTable';
import { StatusBadge } from '../components/StatusBadge';
import { leaveDaysConfirmedUsed, leaveDaysRemaining, leaveDaysReserved } from '../lib/leaveLogic';
import { fmtLongDate, today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';

const ALL_STATUSES: LeaveRequest['status'][] = ['pending', 'approved', 'declined', 'rescheduled'];
const STATUS_LABEL: Record<LeaveRequest['status'], string> = { planned: 'Planned', pending: 'Pending', approved: 'Approved', declined: 'Declined', rescheduled: 'Reschedule requested' };

function dateRangeLabel(r: LeaveRequest): string {
  const first = r.dates[0] ?? '';
  const last = r.dates[r.dates.length - 1] ?? '';
  if (!first) return '';
  return last && last !== first ? `${fmtLongDate(first)} to ${fmtLongDate(last)}` : fmtLongDate(first);
}

function useActiveAgentRoster() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['leaveAgentRoster'],
    queryFn: async () => (await getDataSource(demoMode).staff.listAll()).filter((s) => s.role === 'agent' && s.active),
  });
}

// Company-wide, filterable history -- rebuilt on the shell's real shadcn
// Select/Collapsible/Table after the 2026-10-08 correction, same
// ApprovalsView filter pattern as Shreyasmark1/leave-management-system.
export function LeaveManagementRequestsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = (searchParams.get('status') as LeaveRequest['status'] | null) ?? 'all';
  const yearFilter = searchParams.get('year') ?? 'all';
  const staffFilter = searchParams.get('staff') ?? 'all';

  const { data: config } = useConfig();
  const { data: roster } = useActiveAgentRoster();
  const { data: requests } = useLeaveRequests();

  const year = new Date(today()).getFullYear();
  const all = requests ?? [];
  const visible = all.filter((r) => r.status !== 'planned');
  const years = Array.from(new Set(visible.map((r) => String(r.year)))).sort().reverse();

  let filtered = visible;
  if (statusFilter !== 'all') filtered = filtered.filter((r) => r.status === statusFilter);
  if (yearFilter !== 'all') filtered = filtered.filter((r) => String(r.year) === yearFilter);
  if (staffFilter !== 'all') filtered = filtered.filter((r) => r.agentKey === staffFilter);
  filtered = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const noFiltersActive = statusFilter === 'all' && yearFilter === 'all' && staffFilter === 'all';

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    router.push(`/dashboard/leave/management/requests${next.toString() ? `?${next.toString()}` : ''}`);
  }

  return (
    <div className="p-4 pb-24 md:p-8">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/leave/management">
          <ArrowLeft />
          Management
        </Link>
      </Button>
      <PageHeader title="Company-wide requests" description={`${filtered.length} request${filtered.length === 1 ? '' : 's'}${statusFilter !== 'all' ? ` · ${STATUS_LABEL[statusFilter]}` : ''}`} />

      <div className="mb-6 flex flex-wrap gap-2">
        <Select value={staffFilter} onValueChange={(v) => setParam('staff', v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All staff</SelectItem>
            {(roster ?? []).map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setParam('status', v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
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

      {noFiltersActive && (
        <Card className="mb-6">
          <CardContent className="grid gap-2">
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">Every staff member — {year}</h2>
            {!roster && <p className="text-sm text-muted-foreground">Loading roster…</p>}
            {roster && roster.length === 0 && <p className="text-sm text-muted-foreground">No active staff on the roster.</p>}
            {(roster ?? []).map((s) => {
              const reserved = config ? leaveDaysReserved(visible, s.key, year) : 0;
              const confirmedUsed = leaveDaysConfirmedUsed(visible, s.key, year, today());
              const remaining = config ? leaveDaysRemaining(config, visible, s.key, year) : null;
              const own = visible.filter((r) => r.agentKey === s.key).sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''));
              return (
                <Collapsible key={s.key} className="rounded-lg border">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 p-3 text-left">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {own.length} request{own.length === 1 ? '' : 's'} in {year}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {remaining ?? '--'}/{config?.leaveTotalDays ?? '--'} left
                      </Badge>
                      <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="grid gap-2 border-t p-3 text-sm">
                    {own.length === 0 && <p className="text-muted-foreground">No leave requests yet.</p>}
                    {own.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2">
                        <span>
                          {dateRangeLabel(r)}
                          {r.isEmergency ? <Badge variant="destructive" className="ml-2">Emergency</Badge> : null}
                        </span>
                        <StatusBadge status={r.status} />
                      </div>
                    ))}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {reserved} reserved &middot; {confirmedUsed} confirmed used of {config?.leaveTotalDays ?? 20} in {year}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">{noFiltersActive ? 'All requests' : 'Matching requests'}</h2>
          <LeaveRequestsDataTable requests={filtered} showAgent emptyMessage="No matching requests." />
        </CardContent>
      </Card>
    </div>
  );
}
