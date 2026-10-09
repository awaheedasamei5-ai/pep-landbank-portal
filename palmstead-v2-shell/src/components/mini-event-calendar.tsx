"use client";

import { useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import type { CalendarOptions, DateClickInfo } from "@fullcalendar/react";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventCalendarViews } from "@/components/calendar/event-calendar-views";

// Shared compact month calendar, built on the shell's own real FullCalendar
// integration (src/components/calendar/event-calendar-views.tsx -- the
// same premium calendar used by /dashboard/calendar, never touched here
// per AGENTS.md) instead of the bare shadcn date-picker primitive. Used
// throughout Leave and Attendance after the 2026-10-09 correction: no
// hand-rolled day grids, one real calendar component everywhere.
export interface MiniEventCalendarProps extends Omit<CalendarOptions, "plugins" | "initialView" | "headerToolbar" | "height"> {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onDateClick?: (info: DateClickInfo) => void;
}

export function MiniEventCalendar({ title, onPrev, onNext, onDateClick, ...options }: MiniEventCalendarProps) {
  const controller = useCalendarController();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => {
            onPrev();
            controller.prev();
          }}
          aria-label="Previous month"
        >
          <ChevronLeft />
        </Button>
        <div className="font-heading text-sm font-semibold">{title}</div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => {
            onNext();
            controller.next();
          }}
          aria-label="Next month"
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <EventCalendarViews
          controller={controller}
          initialView="dayGridMonth"
          plugins={[dayGridPlugin, interactionPlugin]}
          headerToolbar={false}
          height="auto"
          dayMaxEvents={3}
          popoverCloseContent={() => <XIcon className="size-5 text-muted-foreground group-hover:text-foreground" />}
          dateClick={onDateClick}
          {...options}
        />
      </div>
    </div>
  );
}
