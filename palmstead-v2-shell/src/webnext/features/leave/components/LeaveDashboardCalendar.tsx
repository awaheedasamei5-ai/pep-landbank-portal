"use client";

import { Calendar } from '@/components/ui/calendar';
import { ghanaHolidayMapForYear } from '../../../shared/lib/ghanaHolidays';
import { companyClosuresForYear } from '../lib/leaveLogic';
import type { Config, LeaveHoliday, LeaveRequest } from '../../../types/domain';

// Dashboard's own READ-ONLY month view, rebuilt on the shell's real
// shadcn Calendar (react-day-picker) after the 2026-10-09 correction --
// same real component used everywhere else now, fixed small cell size
// instead of the earlier hand-rolled grid that could balloon to
// oversized squares on a wide container.
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
  const monthDate = new Date(year, month, 1);
  const leaveDays = Array.from(new Set(approvedRequests.flatMap((r) => r.dates || []))).map((d) => new Date(`${d}T00:00:00`));
  const holidays = Array.from(ghanaHolidayMapForYear(year, config.eidWindows, companyClosuresForYear(companyClosures, year)).keys()).map((d) => new Date(`${d}T00:00:00`));

  function handleMonthChange(next: Date) {
    const delta = (next.getFullYear() - year) * 12 + (next.getMonth() - month);
    if (delta !== 0) onNavMonth(delta);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Calendar
        month={monthDate}
        onMonthChange={handleMonthChange}
        modifiers={{ leave: leaveDays, holiday: holidays }}
        modifiersClassNames={{
          leave: 'bg-destructive/15 text-destructive',
          holiday: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
        }}
      />
      <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
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
