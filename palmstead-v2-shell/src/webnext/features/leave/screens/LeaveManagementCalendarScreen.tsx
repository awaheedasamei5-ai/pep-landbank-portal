"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { PageHeader } from '@/components/page-header';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaveRequests } from '../hooks/useLeaveRequests';
import { useLeaveHolidays } from '../hooks/useLeaveHolidays';
import { LeaveRequestsDataTable } from '../components/LeaveRequestsDataTable';
import { companyClosuresForYear } from '../lib/leaveLogic';
import { ghanaHolidayMapForYear } from '../../../shared/lib/ghanaHolidays';
import { today } from '../../../shared/lib/format';
import type { LeaveRequest } from '../../../types/domain';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function iso(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

// Real "who's out when" company-wide calendar, rebuilt on the shell's
// real shadcn Calendar (react-day-picker) after the 2026-10-09
// correction -- a custom DayButton renders each day's initials chips
// inside the same real calendar grid used throughout the rest of the
// app, instead of a bespoke hand-rolled grid that could balloon to
// oversized cells on a wide container.
export function LeaveManagementCalendarScreen() {
  const { data: config } = useConfig();
  const { data: requests } = useLeaveRequests();
  const { data: companyClosures } = useLeaveHolidays();
  const now = new Date(today());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const all = requests ?? [];
  const relevant = all.filter((r) => r.status === 'approved' || r.status === 'pending');

  const nDays = new Date(year, month + 1, 0).getDate();
  const holidays = config ? ghanaHolidayMapForYear(year, config.eidWindows, companyClosuresForYear(companyClosures ?? [], year)) : new Map();

  const byDate = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    relevant.forEach((r) => {
      (r.dates || []).forEach((d) => {
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(r);
      });
    });
    return map;
  }, [relevant]);

  const monthEntries = useMemo(() => {
    const seen = new Map<string, LeaveRequest>();
    for (let d = 1; d <= nDays; d++) {
      const dayIso = iso(year, month, d);
      (byDate.get(dayIso) ?? []).forEach((r) => {
        const key = `${r.agentKey}-${r.id}`;
        if (!seen.has(key)) seen.set(key, r);
      });
    }
    return Array.from(seen.values()).sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''));
  }, [byDate, nDays, year, month]);

  function handleMonthChange(next: Date) {
    const delta = (next.getFullYear() - year) * 12 + (next.getMonth() - month);
    if (delta === 0) return;
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

  const holidayDates = Array.from(holidays.keys()).map((d) => new Date(`${d}T00:00:00`));

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
        <CardContent className="flex flex-col items-center gap-3 pt-6">
          <Calendar
            month={new Date(year, month, 1)}
            onMonthChange={handleMonthChange}
            modifiers={{ holiday: holidayDates }}
            modifiersClassNames={{ holiday: 'bg-amber-500/15' }}
            className="[--cell-size:--spacing(14)]"
            components={{
              DayButton: ({ day, modifiers, className, children, ...props }) => {
                const dayIso = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}`;
                const onLeave = byDate.get(dayIso) ?? [];
                return (
                  <button type="button" className={`${className} flex-col gap-1 rounded-md`} {...props}>
                    <span className="text-xs">{day.date.getDate()}</span>
                    {onLeave.length > 0 && (
                      <span className="flex flex-wrap items-center justify-center gap-0.5" title={onLeave.map((r) => r.agentName).join(', ')}>
                        {onLeave.slice(0, 2).map((r) => (
                          <span
                            key={r.id}
                            className={`flex size-4 items-center justify-center rounded-full text-[8px] font-bold text-white ${r.status === 'pending' ? 'bg-amber-500' : 'bg-primary'}`}
                          >
                            {initials(r.agentName)}
                          </span>
                        ))}
                        {onLeave.length > 2 && <span className="text-[8px] text-muted-foreground">+{onLeave.length - 2}</span>}
                      </span>
                    )}
                  </button>
                );
              },
            }}
          />
          <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
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
          <CardTitle>
            Out in {MONTH_NAMES[month]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveRequestsDataTable requests={monthEntries} showAgent emptyMessage={`Nobody's leave falls in ${MONTH_NAMES[month]} ${year}.`} />
        </CardContent>
      </Card>
    </div>
  );
}
