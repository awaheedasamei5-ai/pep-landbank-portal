"use client";

import { useState } from 'react';
import type { DateClickInfo, EventInput } from '@fullcalendar/react';
import { MiniEventCalendar } from '@/components/mini-event-calendar';
import { ghanaHolidayMapForYear, isWeekendIso } from '../../../shared/lib/ghanaHolidays';
import { companyClosuresForYear, leaveConflictDatesFromOthers, leaveIsBlocking } from '../lib/leaveLogic';
import { today } from '../../../shared/lib/format';
import type { Config, LeaveHoliday, LeaveRequest } from '../../../types/domain';

// V1's real leave calendar (weekend/holiday/already-taken/colleague-
// conflict/selected/today/past), rebuilt on the shell's own real
// FullCalendar integration (MiniEventCalendar) after the 2026-10-09
// correction -- click-to-toggle individual (non-contiguous) days via
// dateClick, blocked/selected days shown as real background events.
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
  const [title, setTitle] = useState('');
  const monthDate = new Date(year, month, 1);
  const myTaken = new Set(requests.filter((r) => r.agentKey === agentKey && leaveIsBlocking(r.status)).flatMap((r) => r.dates || []));
  const otherConflicts = leaveConflictDatesFromOthers(requests, agentKey);
  const holidays = ghanaHolidayMapForYear(year, config.eidWindows, companyClosuresForYear(companyClosures, year));
  const observesEid = (config.eidObservingStaff || []).includes(agentKey);
  const t = today();

  function blockedReason(iso: string): string | null {
    if (iso < t) return 'Past date';
    if (isWeekendIso(iso)) return 'Weekend';
    const h = holidays.get(iso);
    if (h && !(h.isEid && observesEid)) return h.name;
    if (myTaken.has(iso)) return 'Already requested';
    if (otherConflicts.has(iso)) return "Conflicts with a colleague's leave";
    return null;
  }

  function handleDateClick(info: DateClickInfo) {
    const iso = info.dateStr;
    if (!selectedDates.includes(iso) && blockedReason(iso)) return;
    onToggleDate(iso);
  }

  const events: EventInput[] = [];
  for (const d of selectedDates) events.push({ start: d, allDay: true, display: 'background', color: 'var(--primary)' });
  for (const [date, h] of holidays) {
    if (!(h.isEid && observesEid)) events.push({ start: date, allDay: true, display: 'background', color: 'var(--color-amber-500)', title: h.name });
  }
  for (const d of myTaken) events.push({ start: d, allDay: true, display: 'background', color: 'var(--destructive)', title: 'Already requested' });
  for (const d of otherConflicts) events.push({ start: d, allDay: true, display: 'background', color: 'var(--destructive)', title: "Colleague's leave" });

  return (
    <div>
      <MiniEventCalendar
        title={title}
        onPrev={() => onNavMonth(-1)}
        onNext={() => onNavMonth(1)}
        initialDate={monthDate}
        events={events}
        validRange={{ start: t }}
        onDateClick={handleDateClick}
        datesSet={(info) => setTitle(info.view.title)}
      />
      <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
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
        <div className="mt-3 flex flex-wrap justify-center gap-2">
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
