"use client";

import { useState } from 'react';
import type { EventInput } from '@fullcalendar/react';
import { MiniEventCalendar } from '@/components/mini-event-calendar';
import type { DayCell } from '../hooks/useAttendanceMonth';

const STATUS_COLOR: Record<string, string> = {
  onTime: 'var(--color-emerald-500)',
  late: 'var(--destructive)',
  absent: 'var(--muted-foreground)',
  leave: 'var(--primary)',
  weekend: 'var(--muted)',
};

// Leave-aware calendar heatmap (Attendance plan Part 3), rebuilt on the
// shell's own real FullCalendar integration (MiniEventCalendar ->
// src/components/calendar/event-calendar-views.tsx) after the
// 2026-10-09 correction -- the earlier hand-rolled grid (and, briefly,
// the bare shadcn date-picker primitive) were both rejected; this is
// the one real, already-polished calendar resource this repo ships
// with, used here as real background events, one per day.
export function AttendanceCalendar({ cells }: { cells: DayCell[] }) {
  const [title, setTitle] = useState('');
  if (!cells.length) return null;

  const events: EventInput[] = cells
    .filter((cell) => !cell.isFuture)
    .map((cell) => {
      const status = cell.isOnLeave ? 'leave' : !cell.isWorkday ? 'weekend' : cell.record?.signInAt ? (cell.isLate ? 'late' : 'onTime') : 'absent';
      return { start: cell.date, allDay: true, display: 'background', color: STATUS_COLOR[status] };
    });
  const monthStart = cells[0].date;
  const monthEndExclusive = new Date(`${cells[cells.length - 1].date}T00:00:00`);
  monthEndExclusive.setDate(monthEndExclusive.getDate() + 1);

  return (
    <div>
      <MiniEventCalendar
        title={title}
        onPrev={() => {}}
        onNext={() => {}}
        events={events}
        initialDate={monthStart}
        validRange={{ start: monthStart, end: monthEndExclusive.toISOString().slice(0, 10) }}
        datesSet={(info) => setTitle(info.view.title)}
      />
      <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-emerald-500" /> On time
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-destructive" /> Late
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-muted-foreground/50" /> Absent
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-primary" /> Leave
        </span>
      </div>
    </div>
  );
}
