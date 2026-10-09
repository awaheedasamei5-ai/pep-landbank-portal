"use client";

import { useMemo, useState } from "react";
import { useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import type { DateClickInfo, DateSelectInfo, EventClickInfo, EventDropInfo, EventInput, EventResizeDoneInfo } from "@fullcalendar/react";
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Plus, Trash2, X, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EventCalendarViews } from "@/components/calendar/event-calendar-views";
import { Input } from "@/components/ui/input";
import { isoDateOnly } from "@/lib/palmstead/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";
import {
  type RecurFreq,
  type Todo,
  useCreateRecurringTodo,
  useCreateTodo,
  useDeleteTodo,
  useMySchedule,
  useRescheduleTodo,
  useUpdateTodo,
  useUpdateTodoStatus,
} from "./use-my-schedule";

// Real "My Schedule" (day/week/month personal planner with reminders),
// ported from V1's real schedule_items (kind='todo') logic -- see
// use-my-schedule.ts for the full real-logic mapping. Built on the
// shell's own real FullCalendar integration (event-calendar-views.tsx),
// same reference pattern as /dashboard/calendar's own Calendar.tsx --
// editable:true + eventDrop/eventResize for real drag-to-reschedule,
// not a hand-rolled grid.
const VIEWS = [
  { key: "dayGridMonth", label: "Month" },
  { key: "timeGridWeek", label: "Week" },
  { key: "timeGridDay", label: "Day" },
];

const STATUS_COLOR: Record<string, string> = {
  open: "var(--primary)",
  done: "var(--color-emerald-500)",
  cancelled: "var(--muted-foreground)",
  rescheduled: "var(--muted-foreground)",
};

function toEventInput(todo: Todo): EventInput {
  const start = todo.startTime ? `${todo.date}T${todo.startTime}:00` : todo.date;
  const end = todo.endTime ? `${todo.date}T${todo.endTime}:00` : undefined;
  return {
    id: todo.id,
    title: todo.status === "done" ? `✓ ${todo.title}` : todo.title,
    start,
    end,
    allDay: !todo.startTime,
    color: STATUS_COLOR[todo.status],
    classNames: todo.status === "cancelled" || todo.status === "rescheduled" ? ["opacity-40", "line-through"] : [],
    extendedProps: { todo },
  };
}

function TodoDetailDialog({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const updateStatus = useUpdateTodoStatus();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? "");

  async function saveEdits() {
    if (title !== todo.title || notes !== (todo.notes ?? "")) {
      await updateTodo.mutateAsync({ id: todo.id, patch: { title, notes: notes || null } });
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{todo.date}{todo.startTime ? ` · ${todo.startTime}–${todo.endTime ?? ""}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveEdits} placeholder="Title" />
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveEdits} placeholder="Notes" rows={3} />
          {todo.escalatedToName && (
            <p className="text-muted-foreground text-xs">
              Escalated to {todo.escalatedToName}
              {todo.escalationNote && `: "${todo.escalationNote}"`}
            </p>
          )}
          {todo.recursFreq && <Badge variant="outline">Repeats {todo.recursFreq}</Badge>}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {todo.status === "open" && (
              <Button size="sm" onClick={() => updateStatus.mutateAsync({ id: todo.id, status: "done" }).then(onClose)}>
                <Check />
                Mark done
              </Button>
            )}
            {todo.status === "open" && (
              <Button size="sm" variant="outline" onClick={() => updateStatus.mutateAsync({ id: todo.id, status: "cancelled" }).then(onClose)}>
                <X />
                Cancel
              </Button>
            )}
          </div>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon-sm">
                <Trash2 className="size-4" />
              </Button>
            }
            title="Delete this item?"
            description="This permanently removes it from your schedule."
            confirmLabel="Delete"
            onConfirm={() => deleteTodo.mutateAsync(todo.id).then(onClose)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddForm({ defaultDate, onDone }: { defaultDate: string; onDone: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const createTodo = useCreateTodo(profile?.key, profile?.name);
  const createRecurring = useCreateRecurringTodo(profile?.key, profile?.name);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [freq, setFreq] = useState<RecurFreq>("weekly");
  const [until, setUntil] = useState("");

  async function submit() {
    if (!title.trim()) return;
    const input = { title: title.trim(), notes: null, contact: null, date, startTime: startTime || null, endTime: endTime || null };
    if (repeat) {
      await createRecurring.mutateAsync({ ...input, recur: { freq, interval: 1, until: until || null } });
    } else {
      await createTodo.mutateAsync(input);
    }
    setTitle("");
    setStartTime("");
    setEndTime("");
    setRepeat(false);
    setUntil("");
    onDone();
  }

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 pt-6">
        <Input placeholder="What do you need to do?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-32" placeholder="Start" />
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-32" placeholder="End" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={repeat} onCheckedChange={setRepeat} />
          Repeat
        </label>
        {repeat && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={freq} onValueChange={(v) => setFreq(v as RecurFreq)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="w-40" placeholder="Until (optional)" />
          </div>
        )}
        <SubmitButton type="button" loading={createTodo.isPending || createRecurring.isPending} onClick={submit} className="ml-auto">
          Add
        </SubmitButton>
      </CardContent>
    </Card>
  );
}

export function MyScheduleScreen() {
  const profile = useAuthStore((s) => s.profile);
  const controller = useCalendarController();
  const reschedule = useRescheduleTodo(profile?.key, profile?.name);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Todo | null>(null);
  const [range, setRange] = useState(() => ({ title: format(new Date(), "MMMM yyyy"), from: isoDateOnly(startOfMonth(new Date())), to: isoDateOnly(endOfMonth(new Date())) }));

  // Widened +/-7 days past the visible range so conflict checks and the
  // "due soon" banner below see a little past/future the calendar grid
  // doesn't currently render.
  const { data: todos } = useMySchedule(profile?.key, range.from, range.to);

  const events = useMemo(() => (todos ?? []).map(toEventInput), [todos]);

  const today = isoDateOnly(new Date());
  const in3Days = isoDateOnly(addDays(new Date(), 3));
  const dueSoon = (todos ?? []).filter((t) => t.status === "open" && t.date >= today && t.date <= in3Days);
  const overdue = (todos ?? []).filter((t) => t.status === "open" && t.date < today);

  async function handleEventDrop(info: EventDropInfo) {
    const todo = (info.event.extendedProps as { todo: Todo }).todo;
    const newStart = info.event.start;
    if (!newStart) return;
    const newDate = isoDateOnly(newStart);
    const newStartTime = todo.startTime ? format(newStart, "HH:mm") : null;
    const newEndTime = info.event.end ? format(info.event.end, "HH:mm") : todo.endTime;
    try {
      await reschedule.mutateAsync({ todo, newDate, newStart: newStartTime, newEnd: newEndTime });
    } catch {
      info.revert();
    }
  }

  async function handleEventResize(info: EventResizeDoneInfo) {
    const todo = (info.event.extendedProps as { todo: Todo }).todo;
    const newStart = info.event.start;
    const newEnd = info.event.end;
    if (!newStart || !newEnd) return;
    try {
      await reschedule.mutateAsync({ todo, newDate: isoDateOnly(newStart), newStart: format(newStart, "HH:mm"), newEnd: format(newEnd, "HH:mm") });
    } catch {
      info.revert();
    }
  }

  function handleEventClick(info: EventClickInfo) {
    setSelected((info.event.extendedProps as { todo: Todo }).todo);
  }

  const [quickAddDate, setQuickAddDate] = useState(today);

  function handleDateClick(info: DateClickInfo) {
    setQuickAddDate(isoDateOnly(info.date));
    setShowForm(true);
  }

  function handleSelect(info: DateSelectInfo) {
    setQuickAddDate(isoDateOnly(info.start));
    setShowForm(true);
  }

  return (
    <div className="grid gap-4">
      {overdue.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-2 pt-6 text-destructive text-sm">
            <AlertTriangle className="size-4" />
            {overdue.length} overdue item{overdue.length === 1 ? "" : "s"}: {overdue.map((t) => t.title).join(", ")}
          </CardContent>
        </Card>
      )}
      {dueSoon.length > 0 && (
        <Card>
          <CardContent className="pt-6 text-sm">
            <span className="font-medium">Coming up: </span>
            {dueSoon.map((t) => `${t.title} (${t.date})`).join(", ")}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col overflow-hidden rounded-md border">
        <div className="flex flex-col gap-4 border-b bg-sidebar p-4 text-sidebar-foreground lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 shrink-0 flex-col gap-1">
            <div className="font-medium text-lg leading-none">{range.title}</div>
            <p className="text-muted-foreground text-sm">{(todos ?? []).filter((t) => t.status !== "rescheduled").length} items</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonGroup>
              <Button size="icon" variant="outline" onClick={() => controller.prev()}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" onClick={() => controller.today()}>
                Today
              </Button>
              <Button size="icon" variant="outline" onClick={() => controller.next()}>
                <ChevronRight />
              </Button>
            </ButtonGroup>
            <Select value={controller.view?.type ?? VIEWS[0].key} onValueChange={(v) => controller.changeView(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {VIEWS.map((v) => (
                  <SelectItem key={v.key} value={v.key}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setQuickAddDate(today);
                setShowForm((v) => !v);
              }}
            >
              <Plus />
              Add
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="p-4">
            <QuickAddForm defaultDate={quickAddDate} onDone={() => setShowForm(false)} />
          </div>
        )}

        <EventCalendarViews
          controller={controller}
          initialView={VIEWS[0].key}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          popoverCloseContent={() => <XIcon className="size-5 text-muted-foreground group-hover:text-foreground" />}
          events={events}
          editable
          selectable
          nowIndicator
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          select={handleSelect}
          datesSet={(info) => {
            setRange({ title: info.view.title, from: isoDateOnly(info.start), to: isoDateOnly(info.end) });
          }}
        />
      </div>

      {selected && <TodoDetailDialog todo={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
