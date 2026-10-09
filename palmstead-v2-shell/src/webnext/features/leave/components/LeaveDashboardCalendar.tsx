"use client";

import { useState } from 'react';
import type { EventInput } from '@fullcalendar/react';
import { MiniEventCalendar } from '@/components/mini-event-calendar';
import { ghanaHolidayMapForYear } from '../../../shared/lib/ghanaHolidays';
import { companyClosuresForYear } from '../lib/leaveLogic';
import type { Config, LeaveHoliday, LeaveRequest } from '../../../types/domain';

// Dashboard's own READ-ONLY month view, rebuilt on the shell's own real
// FullCalendar integration (MiniEventCalendar) after the 2026-10-09
// correction -- the same real calendar component used throughout Leave
// and Attendance now, not a hand-rolled grid or the bare shadcn
// date-picker primitive.
export function LeaveDashboardCalendar({
  year,
  month,
  onNavMonth,
  approvedRequests,
  config,
  companyClosures = [],
}: {
  year: number;
  month: number;
  onNavMonth: (delta: number) => void;
  approvedRequests: LeaveRequest[];
  config: Config;
  companyClosures?: LeaveHoliday[];
}) {
  const [title, setTitle] = useState('');
  const monthDate = new Date(year, month, 1);
  const holidays = ghanaHolidayMapForYear(year, config.eidWindows, companyClosuresForYear(companyClosures, year));

  const events: EventInput[] = [
    ...new Set(approvedRequests.flatMap((r) => r.dates || [])),
  ].map((d) => ({ start: d, allDay: true, display: 'background', color: 'var(--destructive)' }));
  for (const [date, holiday] of holidays) {
    events.push({ start: date, allDay: true, display: 'background', color: 'var(--color-amber-500)', title: holiday.name });
  }

  return (
    <div>
      <MiniEventCalendar
        title={title}
        onPrev={() => onNavMonth(-1)}
        onNext={() => onNavMonth(1)}
        initialDate={monthDate}
        events={events}
        datesSet={(info) => setTitle(info.view.title)}
      />
      <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-destructive" /> Approved leave
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-amber-500" /> Public holiday
        </span>
      </div>
    </div>
  );
}
