"use client";

import { Calendar } from '@/components/ui/calendar';
import { ghanaHolidayMapForYear } from '../../../shared/lib/ghanaHolidays';
import { companyClosuresForYear, leaveConflictDatesFromOthers, leaveIsBlocking } from '../lib/leaveLogic';
import type { Config, LeaveHoliday, LeaveRequest } from '../../../types/domain';

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// V1's real leave calendar (weekend/holiday/already-taken/colleague-
// conflict/selected/today/past), rebuilt on the shell's real shadcn
// Calendar (react-day-picker, mode="multiple") after the 2026-10-09
// correction -- same real component used everywhere else, fixed small
// cell size instead of the earlier hand-rolled grid.
export function LeaveCalendar({
  year,
  month,
  onNavMonth,
  requests,
  agentKey,
  config,
  selectedDates,
  onToggleDate,
  companyClosures = [],
}: {
  year: number;
  month: number;
  onNavMonth: (delta: number) => void;
  requests: LeaveRequest[];
  agentKey: string;
  config: Config;
  selectedDates: string[];
  onToggleDate: (iso: string) => void;
  companyClosures?: LeaveHoliday[];
}) {
  const monthDate = new Date(year, month, 1);
  const myTaken = new Set(requests.filter((r) => r.agentKey === agentKey && leaveIsBlocking(r.status)).flatMap((r) => r.dates || []));
  const otherConflicts = leaveConflictDatesFromOthers(requests, agentKey);
  const holidays = ghanaHolidayMapForYear(year, config.eidWindows, companyClosuresForYear(companyClosures, year));
  const observesEid = (config.eidObservingStaff || []).includes(agentKey);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  function isHoliday(iso: string) {
    const h = holidays.get(iso);
    return !!h && !(h.isEid && observesEid);
  }

  const holidayDates = Array.from(holidays.keys()).filter(isHoliday).map((d) => new Date(`${d}T00:00:00`));
  const takenDates = Array.from(myTaken).map((d) => new Date(`${d}T00:00:00`));
  const conflictDates = Array.from(otherConflicts).map((d) => new Date(`${d}T00:00:00`));
  const selected = selectedDates.map((d) => new Date(`${d}T00:00:00`));

  function handleMonthChange(next: Date) {
    const delta = (next.getFullYear() - year) * 12 + (next.getMonth() - month);
    if (delta !== 0) onNavMonth(delta);
  }

  function handleSelect(next: Date[] | undefined) {
    const nextIso = new Set((next ?? []).map(toIso));
    const prevIso = new Set(selectedDates);
    for (const iso of nextIso) if (!prevIso.has(iso)) onToggleDate(iso);
    for (const iso of prevIso) if (!nextIso.has(iso)) onToggleDate(iso);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Calendar
        mode="multiple"
        month={monthDate}
        onMonthChange={handleMonthChange}
        selected={selected}
        onSelect={handleSelect}
        disabled={[{ before: todayStart }, ...holidayDates, ...takenDates, ...conflictDates, { dayOfWeek: [0, 6] }]}
        modifiers={{ holiday: holidayDates, taken: [...takenDates, ...conflictDates] }}
        modifiersClassNames={{
          holiday: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
          taken: 'bg-destructive/15 text-destructive',
        }}
      />
      <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-primary" /> Selected
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-amber-500" /> Public holiday
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-destructive" /> Taken / colleague&apos;s leave
        </span>
      </div>
      {selectedDates.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {selectedDates
            .slice()
            .sort()
            .map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onToggleDate(d)}
                className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-medium text-primary hover:bg-primary/20"
              >
                {d} ✕
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
