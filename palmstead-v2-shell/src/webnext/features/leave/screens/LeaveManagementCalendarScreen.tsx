"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { EventInput } from '@fullcalendar/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MiniEventCalendar } from '@/components/mini-event-calendar';
import { PageHeader } from '@/components/page-header';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { LeaveRequestsDataTable } from '../components/LeaveRequestsDataTable';
import { companyClosuresForYear } from '../lib/leaveLogic';
import { ghanaHolidayMapForYear } from '../../../shared/lib/ghanaHolidays';
import { today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';

// Real "who's out when" company-wide calendar, rebuilt on the shell's
// own real FullCalendar integration (MiniEventCalendar) after the
// 2026-10-09 correction -- each leave request is a genuine calendar
// event (title = staff name, spanning its real date range, colored by
// status), the natural FullCalendar use case, instead of a hand-rolled
// day-chip grid or per-day initials hack.
export function LeaveManagementCalendarScreen() {
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
  const { data: companyClosures } = useLeaveHolidays();
  const now = new Date(today());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [title, setTitle] = useState('');

  const all = requests ?? [];
  const relevant = useMemo(() => all.filter((r) => r.status === 'approved' || r.status === 'pending'), [all]);
  const holidays = config ? ghanaHolidayMapForYear(year, config.eidWindows, companyClosuresForYear(companyClosures ?? [], year)) : new Map();

  const events: EventInput[] = useMemo(() => {
    const out: EventInput[] = [];
    for (const [date, h] of holidays) out.push({ start: date, allDay: true, display: 'background', color: 'var(--color-amber-500)', title: h.name });
    for (const r of relevant) {
      const dates = [...r.dates].sort();
      const first = dates[0];
      const last = dates[dates.length - 1];
      if (!first) continue;
      const endExclusive = new Date(`${last}T00:00:00`);
      endExclusive.setDate(endExclusive.getDate() + 1);
      out.push({
        title: r.agentName + (r.isEmergency ? ' 🚨' : ''),
        start: first,
        end: endExclusive.toISOString().slice(0, 10),
        allDay: true,
        color: r.status === 'pending' ? 'var(--color-amber-500)' : 'var(--primary)',
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- holidays is a Map rebuilt each render, iterated by value above
  }, [relevant, year, month, companyClosures, config]);

  const monthEntries = useMemo(() => {
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const nDays = new Date(year, month + 1, 0).getDate();
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(nDays).padStart(2, '0')}`;
    const seen = new Map<string, LeaveRequest>();
    relevant.forEach((r) => {
      if ((r.dates || []).some((d) => d >= monthStart && d <= monthEnd)) seen.set(r.id, r);
    });
    return Array.from(seen.values()).sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''));
  }, [relevant, year, month]);

  function navMonth(delta: number) {
    let m = month + delta;
    let y = year;
    while (m < 0) {
      m += 12;
      y--;
    }
    while (m > 11) {
      m -= 12;
      y++;
    }
    setMonth(m);
    setYear(y);
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/leave/management">
          <ArrowLeft />
          Management
        </Link>
      </Button>
      <PageHeader title="Team calendar" description="Who's out, company-wide" />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <MiniEventCalendar
            title={title}
            onPrev={() => navMonth(-1)}
            onNext={() => navMonth(1)}
            initialDate={new Date(year, month, 1)}
            events={events}
            datesSet={(info) => setTitle(info.view.title)}
          />
          <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="inline-block size-2 rounded-full bg-primary" /> Approved
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block size-2 rounded-full bg-amber-500" /> Pending / holiday
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Out this month</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveRequestsDataTable requests={monthEntries} showAgent emptyMessage="Nobody's leave falls in this month." />
        </CardContent>
      </Card>
    </div>
  );
}
