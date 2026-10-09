"use client";

import { Calendar } from '@/components/ui/calendar';
import type { DayCell } from '../hooks/useAttendanceMonth';

// Leave-aware calendar heatmap (Attendance plan Part 3), rebuilt on the
// shell's real shadcn Calendar (react-day-picker) after the 2026-10-09
// correction -- the earlier hand-rolled CSS-module grid had no width cap
// on its cells and ballooned to oversized squares once the page's own
// redundant padding wrapper was removed. The real Calendar's cells are a
// fixed --cell-size, so this can never happen again, and it matches the
// same calendar component used throughout the rest of the app.
export function AttendanceCalendar({ cells }: { cells: DayCell[] }) {
  if (!cells.length) return null;
  const monthDate = new Date(`${cells[0].date}T00:00:00`);

  const onTime: Date[] = [];
  const late: Date[] = [];
  const absent: Date[] = [];
  const leave: Date[] = [];
  const weekend: Date[] = [];
  const future: Date[] = [];

  cells.forEach((cell) => {
    const d = new Date(`${cell.date}T00:00:00`);
    if (cell.isFuture) future.push(d);
    else if (cell.isOnLeave) leave.push(d);
    else if (!cell.isWorkday) weekend.push(d);
    else if (cell.record?.signInAt) (cell.isLate ? late : onTime).push(d);
    else absent.push(d);
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <Calendar
        startMonth={monthDate}
        endMonth={monthDate}
        defaultMonth={monthDate}
        modifiers={{ onTime, late, absent, leave, weekend, future }}
        modifiersClassNames={{
          onTime: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
          late: 'bg-destructive/15 text-destructive',
          absent: 'bg-muted text-muted-foreground',
          leave: 'bg-primary/15 text-primary',
          weekend: 'text-muted-foreground/40',
          future: 'text-muted-foreground/30',
        }}
      />
      <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
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
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-muted-foreground/20" /> Off day
        </span>
      </div>
    </div>
  );
}
