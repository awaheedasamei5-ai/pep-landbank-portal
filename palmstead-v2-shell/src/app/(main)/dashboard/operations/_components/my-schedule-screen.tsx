"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import type {
  DateClickInfo,
  DateSelectInfo,
  EventClickInfo,
  EventDropInfo,
  EventInput,
  EventResizeDoneInfo,
} from "@fullcalendar/react";
import { useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
  XIcon,
} from "lucide-react";

import { EventCalendarViews } from "@/components/calendar/event-calendar-views";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";

import { ScheduleMeetingComposer, ScheduleMeetingDetails } from "./schedule-meetings-dialogs";
import { SchedulePushSettings } from "./schedule-push-settings";
import {
  addScheduleDays,
  calendarDateOnly,
  calendarTime,
  workspaceDateOnly,
  workspaceMonthRange,
} from "./schedule-time.ts";
import { getScheduleUrgency } from "./schedule-urgency";
import { isVisibleScheduleMeeting, isVisibleScheduleTodo } from "./schedule-visibility";
import {
  checkScheduleConflicts,
  type RecurFreq,
  type Todo,
  useCreateRecurringTodo,
  useCreateTodo,
  useDeleteTodo,
  useEscalateTodo,
  useMySchedule,
  useRescheduleTodo,
  useUpdateTodo,
  useUpdateTodoStatus,
} from "./use-my-schedule";
import {
  type ScheduleMeeting,
  useActiveMeetingStaff,
  useScheduleMeetings,
  useUpdateScheduleMeeting,
} from "./use-schedule-meetings";

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
  { key: "listWeek", label: "Agenda" },
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
    extendedProps: { kind: "todo", todo },
  };
}

function toMeetingEvent(meeting: ScheduleMeeting, canEdit: boolean): EventInput {
  return {
    id: `meeting:${meeting.id}`,
    title: `Meeting · ${meeting.title}`,
    start: meeting.startTime ? `${meeting.date}T${meeting.startTime}:00` : meeting.date,
    end: meeting.endTime ? `${meeting.date}T${meeting.endTime}:00` : undefined,
    allDay: !meeting.startTime,
    color: "var(--chart-2)",
    editable: canEdit && meeting.status !== "cancelled",
    classNames: meeting.status === "cancelled" ? ["opacity-50", "line-through"] : [],
    extendedProps: { kind: "meeting", meeting },
  };
}

function TodoDetailDialog({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const updateStatus = useUpdateTodoStatus();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const reassignTodo = useEscalateTodo(profile?.key, profile?.name);
  const staffQuery = useActiveMeetingStaff();
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [contact, setContact] = useState(todo.contact ?? "");
  const [date, setDate] = useState(todo.date);
  const [startTime, setStartTime] = useState(todo.startTime ?? "");
  const [endTime, setEndTime] = useState(todo.endTime ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [assignee, setAssignee] = useState(todo.assignedTo);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  async function saveAssignment() {
    const target = staffQuery.data?.find((person) => person.key === assignee);
    if (!target || assignee === todo.assignedTo) return;
    setAssignmentError(null);
    setIsAssigning(true);
    try {
      await reassignTodo.mutateAsync({
        id: todo.id,
        toKey: target.key,
        toName: target.name,
        note: "Assigned by management",
      });
      onClose();
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Could not assign this task. Try again.");
    } finally {
      setIsAssigning(false);
    }
  }

  async function saveEdits() {
    setFormError(null);
    if (!title.trim()) return setFormError("Add a title before saving.");
    if (Boolean(startTime) !== Boolean(endTime))
      return setFormError("Enter both a start and end time, or leave both blank.");
    if (startTime && endTime && endTime <= startTime) return setFormError("The end time must be after the start time.");
    setIsSaving(true);
    try {
      if (startTime && endTime && profile?.key) {
        const conflicts = await checkScheduleConflicts(profile.key, date, startTime, endTime, todo.id);
        if (conflicts.length) {
          setFormError(
            `This overlaps with “${conflicts[0].title}” (${conflicts[0].startTime ?? "all day"}${conflicts[0].endTime ? `–${conflicts[0].endTime}` : ""}).`,
          );
          return;
        }
      }
      await updateTodo.mutateAsync({
        todo,
        patch: {
          title: title.trim(),
          notes: notes.trim() || null,
          contact: contact.trim() || null,
          date,
          startTime: startTime || null,
          endTime: endTime || null,
        },
      });
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this task. Try again.");
    } finally {
      setIsSaving(false);
    }
  }
  const hasChanges =
    title !== todo.title ||
    notes !== (todo.notes ?? "") ||
    contact !== (todo.contact ?? "") ||
    date !== todo.date ||
    startTime !== (todo.startTime ?? "") ||
    endTime !== (todo.endTime ?? "");

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="todo-edit-title">Task title</label>
            <Input
              id="todo-edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to get done?"
              maxLength={160}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5 text-sm font-medium">
              <label htmlFor="todo-edit-date">Due date</label>
              <Input id="todo-edit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5 text-sm font-medium">
              <label htmlFor="todo-edit-start">Start time (optional)</label>
              <Input
                id="todo-edit-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5 text-sm font-medium">
              <label htmlFor="todo-edit-end">End time (optional)</label>
              <Input id="todo-edit-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="todo-edit-contact">Related client or reference (optional)</label>
            <Input
              id="todo-edit-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Client name, project, or reference"
            />
          </div>
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="todo-edit-notes">Notes (optional)</label>
            <Textarea
              id="todo-edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add details, next steps, or context"
              rows={3}
            />
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          {todo.escalatedToName && (
            <p className="text-muted-foreground text-xs">
              Escalated to {todo.escalatedToName}
              {todo.escalationNote && `: "${todo.escalationNote}"`}
            </p>
          )}
          {profile?.role === "manager" && todo.status === "open" && !todo.recursFreq && (
            <div className="grid gap-2 rounded-md border p-3">
              <p className="text-sm font-medium">Assign to a staff member</p>
              <p className="text-xs text-muted-foreground">Currently assigned to {todo.assignedToName}.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger aria-label="Assign task to" className="min-w-0 flex-1">
                    <SelectValue placeholder="Choose staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {(staffQuery.data ?? []).map((person) => (
                      <SelectItem key={person.key} value={person.key}>
                        {person.name}
                        {person.department ? ` · ${person.department}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isAssigning || assignee === todo.assignedTo || staffQuery.isLoading}
                  onClick={saveAssignment}
                >
                  {isAssigning ? "Assigning…" : "Assign task"}
                </Button>
              </div>
              {staffQuery.error && (
                <p role="alert" className="text-xs text-destructive">
                  Could not load staff list. Refresh and try again.
                </p>
              )}
              {assignmentError && (
                <p role="alert" className="text-xs text-destructive">
                  {assignmentError}
                </p>
              )}
            </div>
          )}
          {todo.recursFreq && <Badge variant="outline">Repeats {todo.recursFreq}</Badge>}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {hasChanges && (
              <Button size="sm" variant="outline" disabled={isSaving} onClick={saveEdits}>
                Save changes
              </Button>
            )}
            {todo.status === "open" && (
              <Button size="sm" onClick={() => updateStatus.mutateAsync({ todo, status: "done" }).then(onClose)}>
                <Check />
                Mark done
              </Button>
            )}
            {todo.status === "open" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatus.mutateAsync({ todo, status: "cancelled" }).then(onClose)}
              >
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
            onConfirm={() => deleteTodo.mutateAsync(todo).then(onClose)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddForm({ defaultDate, onDone }: { defaultDate: string; onDone: (assignedTo?: string) => void }) {
  const profile = useAuthStore((s) => s.profile);
  const createTodo = useCreateTodo(profile?.key, profile?.name);
  const createRecurring = useCreateRecurringTodo(profile?.key, profile?.name);
  const reassignTodo = useEscalateTodo(profile?.key, profile?.name);
  const staffQuery = useActiveMeetingStaff();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [freq, setFreq] = useState<RecurFreq>("weekly");
  const [until, setUntil] = useState("");
  const [assignee, setAssignee] = useState(profile?.key ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflict, setConflict] = useState<{
    title: string;
    startTime: string | null;
    endTime: string | null;
    kind: "task" | "meeting";
  } | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflictCheckError, setConflictCheckError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Real-time collision detection -- same real V1 logic
  // (apiCheckScheduleConflicts/scheduleConflictReasonText) this app
  // already uses for Operations Tracker issue escalation, applied here:
  // queried live against the real op_todos table on every start/end
  // time change, not computed off whatever's already loaded in the
  // visible calendar range.
  useEffect(() => {
    if (!profile?.key) {
      setConflict(null);
      setCheckingConflicts(false);
      setConflictCheckError(null);
      return;
    }
    let cancelled = false;
    setCheckingConflicts(true);
    setConflictCheckError(null);
    const timer = setTimeout(async () => {
      try {
        const hits = await checkScheduleConflicts(
          repeat ? profile.key : assignee || profile.key,
          date,
          startTime || "",
          endTime || "",
        );
        if (!cancelled) setConflict(hits[0] ?? null);
      } catch {
        if (!cancelled) {
          setConflict(null);
          setConflictCheckError("We couldn't check your schedule. Try again before adding this task.");
        }
      } finally {
        if (!cancelled) setCheckingConflicts(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profile?.key, assignee, repeat, date, startTime, endTime]);

  async function submit() {
    setFormError(null);
    if (!title.trim()) return setFormError("Add a title for this task.");
    if (!date) return setFormError("Choose a due date.");
    if (Boolean(startTime) !== Boolean(endTime))
      return setFormError("Enter both a start and end time, or leave both blank.");
    if (startTime && endTime && endTime <= startTime) return setFormError("The end time must be after the start time.");
    if (repeat && until && until < date)
      return setFormError("The repeat end date must be on or after the first task date.");
    if (checkingConflicts) return setFormError("Wait for the schedule conflict check to finish.");
    if (conflictCheckError) return setFormError(conflictCheckError);
    if (conflict) return setFormError(`This overlaps with “${conflict.title}”. Choose another time.`);
    if (profile?.role === "manager" && !repeat && !staffQuery.data?.some((person) => person.key === assignee))
      return setFormError("Choose an active staff member for this task.");
    const input = {
      title: title.trim(),
      notes: notes.trim() || null,
      contact: contact.trim() || null,
      date,
      startTime: startTime || null,
      endTime: endTime || null,
    };
    setIsSubmitting(true);
    try {
      if (repeat) await createRecurring.mutateAsync({ ...input, recur: { freq, interval: 1, until: until || null } });
      else {
        const created = await createTodo.mutateAsync(input);
        if (profile?.role === "manager" && assignee && assignee !== profile.key) {
          const target = staffQuery.data?.find((person) => person.key === assignee);
          if (!target)
            throw new Error(
              "The task was created for you, but the selected staff member is no longer active. Open the task to assign it.",
            );
          try {
            await reassignTodo.mutateAsync({
              id: created.id,
              toKey: target.key,
              toName: target.name,
              note: "Assigned by management",
            });
          } catch (error) {
            throw new Error(
              `The task was created in your schedule, but could not be assigned to ${target.name}. Open it from your schedule and retry. ${error instanceof Error ? error.message : ""}`,
            );
          }
        }
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create this task. Try again.");
      setIsSubmitting(false);
      return;
    }
    setTitle("");
    setNotes("");
    setContact("");
    setStartTime("");
    setEndTime("");
    setRepeat(false);
    setUntil("");
    setAssignee(profile?.key ?? "");
    setIsSubmitting(false);
    onDone(repeat ? profile?.key : assignee || profile?.key);
  }

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-4 pt-6">
        <div>
          <h3 className="font-semibold">Plan a task</h3>
          <p className="text-sm text-muted-foreground">
            Add the work, choose when it is due, and include useful context.
          </p>
        </div>
        <div className="grid gap-1.5 text-sm font-medium">
          <label htmlFor="todo-new-title">Task title</label>
          <Input
            id="todo-new-title"
            placeholder="e.g. Call client about site visit"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
          />
        </div>
        {profile?.role === "manager" && !repeat && (
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="todo-new-assignee">Assign to</label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="todo-new-assignee">
                <SelectValue placeholder="Choose active staff" />
              </SelectTrigger>
              <SelectContent>
                {(staffQuery.data ?? []).map((person) => (
                  <SelectItem key={person.key} value={person.key}>
                    {person.name}
                    {person.department ? ` · ${person.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {staffQuery.error && (
              <p role="alert" className="text-xs text-destructive">
                Could not load staff. Refresh before assigning this task.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Assigned tasks appear in that person’s schedule after sync.</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="todo-new-date">Due date</label>
            <Input id="todo-new-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="todo-new-start">Start time (optional)</label>
            <Input id="todo-new-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="todo-new-end">End time (optional)</label>
            <Input id="todo-new-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <Alert>
          <BellRing />
          <AlertTitle>Automatic task reminders</AlertTitle>
          <AlertDescription>
            Timed tasks send an SMS to the assigned staff member at the scheduled start. If it remains open, one
            missed-task SMS follows after the end time and grace period. All-day tasks have no timed SMS reminders.
            Messages use the staff member’s phone number on their profile.
          </AlertDescription>
        </Alert>
        <div className="grid gap-1.5 text-sm font-medium">
          <label htmlFor="todo-new-contact">Related client or reference (optional)</label>
          <Input
            id="todo-new-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Client name, project, or reference"
          />
        </div>
        <div className="grid gap-1.5 text-sm font-medium">
          <label htmlFor="todo-new-notes">Notes (optional)</label>
          <Textarea
            id="todo-new-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add instructions or context for this task"
            rows={3}
          />
        </div>
        {conflict && (
          <p className="flex items-center gap-1.5 text-amber-600 text-xs dark:text-amber-400">
            <AlertTriangle className="size-3.5" />
            This overlaps with your {conflict.kind}: &quot;
            {conflict.title}&quot; ({conflict.startTime ?? "all day"}
            {conflict.endTime ? `–${conflict.endTime}` : ""}).
          </p>
        )}
        {conflictCheckError && (
          <p role="alert" className="text-destructive text-xs">
            {conflictCheckError}
          </p>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Switch id="repeat-todo" checked={repeat} onCheckedChange={setRepeat} />
          <label htmlFor="repeat-todo">Repeat</label>
        </div>
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
            <Input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="w-40"
              placeholder="Until (optional)"
            />
          </div>
        )}
        {repeat && (
          <p className="text-xs text-muted-foreground">
            This creates up to 12 task dates in the series. You can adjust each task afterward.
          </p>
        )}
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        <SubmitButton
          type="button"
          disabled={checkingConflicts || Boolean(conflictCheckError)}
          loading={isSubmitting || createTodo.isPending || createRecurring.isPending || reassignTodo.isPending}
          onClick={submit}
          className="ml-auto"
        >
          Add
        </SubmitButton>
      </CardContent>
    </Card>
  );
}

export function MyScheduleScreen() {
  const profile = useAuthStore((s) => s.profile);
  const controller = useCalendarController();
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 639px)");
    const setResponsiveView = () => controller.changeView(mobile.matches ? "listWeek" : "dayGridMonth");
    setResponsiveView();
    mobile.addEventListener("change", setResponsiveView);
    return () => mobile.removeEventListener("change", setResponsiveView);
  }, [controller]);
  const reschedule = useRescheduleTodo(profile?.key, profile?.name);
  const updateMeeting = useUpdateScheduleMeeting();
  const staffQuery = useActiveMeetingStaff();
  const [showForm, setShowForm] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [selected, setSelected] = useState<Todo | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [teamScheduleKey, setTeamScheduleKey] = useState("");
  const [meetingDefaultDate, setMeetingDefaultDate] = useState(workspaceDateOnly(new Date()));
  const [meetingDefaultStart, setMeetingDefaultStart] = useState<string | undefined>();
  const [range, setRange] = useState(() => workspaceMonthRange(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep the action queue anchored to today even when the calendar is
  // browsed to another month. This query is bounded to recent overdue work
  // and near-term tasks, independent of the visible calendar range.
  const {
    data: todos,
    isLoading: todosLoading,
    isError: todosError,
  } = useMySchedule(
    profile?.role === "manager" && teamScheduleKey ? teamScheduleKey : profile?.key,
    range.from,
    range.to,
  );
  const today = workspaceDateOnly(now);
  const triageTodos = useMySchedule(
    profile?.role === "manager" && teamScheduleKey ? teamScheduleKey : profile?.key,
    addScheduleDays(today, -90),
    addScheduleDays(today, 3),
  );
  const meetingsQuery = useScheduleMeetings(profile?.key, range.from, range.to);
  const meetings = meetingsQuery.data;

  const events = useMemo(
    () => [
      ...(todos ?? []).filter((todo) => isVisibleScheduleTodo(todo.status)).map(toEventInput),
      ...(meetings ?? [])
        .filter((meeting) => isVisibleScheduleMeeting(meeting.status))
        .map((meeting) => toMeetingEvent(meeting, profile?.role === "manager" || meeting.ownerKey === profile?.key)),
    ],
    [meetings, profile?.key, profile?.role, todos],
  );
  const selectedMeeting = meetings?.find((meeting) => meeting.id === selectedMeetingId) ?? null;

  const urgency = useMemo(
    () => getScheduleUrgency(triageTodos.data ?? [], now, new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)),
    [triageTodos.data, now],
  );
  const overdue = urgency.overdue;
  const dueSoon = urgency.dueSoon;

  async function handleEventDrop(info: EventDropInfo) {
    const props = info.event.extendedProps as {
      kind?: string;
      todo?: Todo;
      meeting?: ScheduleMeeting;
    };
    const newStart = info.event.start;
    if (!newStart) return;
    const newDate = calendarDateOnly(newStart);
    if (props.kind === "meeting" && props.meeting) {
      try {
        await updateMeeting.mutateAsync({
          id: props.meeting.id,
          patch: {
            date: newDate,
            startTime: calendarTime(newStart),
            endTime: info.event.end ? calendarTime(info.event.end) : props.meeting.endTime,
          },
        });
      } catch {
        info.revert();
      }
      return;
    }
    const todo = props.todo;
    if (!todo) return;
    const newStartTime = todo.startTime ? calendarTime(newStart) : null;
    const newEndTime = info.event.end ? calendarTime(info.event.end) : todo.endTime;
    try {
      await reschedule.mutateAsync({
        todo,
        newDate,
        newStart: newStartTime,
        newEnd: newEndTime,
      });
    } catch {
      info.revert();
    }
  }

  async function handleEventResize(info: EventResizeDoneInfo) {
    const props = info.event.extendedProps as {
      kind?: string;
      todo?: Todo;
      meeting?: ScheduleMeeting;
    };
    const newStart = info.event.start;
    const newEnd = info.event.end;
    if (!newStart || !newEnd) return;
    try {
      if (props.kind === "meeting" && props.meeting) {
        await updateMeeting.mutateAsync({
          id: props.meeting.id,
          patch: {
            date: calendarDateOnly(newStart),
            startTime: calendarTime(newStart),
            endTime: calendarTime(newEnd),
          },
        });
      } else if (props.todo) {
        await reschedule.mutateAsync({
          todo: props.todo,
          newDate: calendarDateOnly(newStart),
          newStart: calendarTime(newStart),
          newEnd: calendarTime(newEnd),
        });
      }
    } catch {
      info.revert();
    }
  }

  function handleEventClick(info: EventClickInfo) {
    const props = info.event.extendedProps as {
      kind?: string;
      todo?: Todo;
      meeting?: ScheduleMeeting;
    };
    if (props.kind === "meeting" && props.meeting) setSelectedMeetingId(props.meeting.id);
    else if (props.todo) setSelected(props.todo);
  }

  const [quickAddDate, setQuickAddDate] = useState(today);

  function handleDateClick(info: DateClickInfo) {
    setQuickAddDate(calendarDateOnly(info.date));
    setShowForm(true);
  }

  function handleSelect(info: DateSelectInfo) {
    setQuickAddDate(calendarDateOnly(info.start));
    setShowForm(true);
  }

  return (
    <div className="grid gap-4">
      <SchedulePushSettings />
      {overdue.length > 0 && (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
          <AlertTriangle />
          <AlertTitle>
            {overdue.length} overdue task{overdue.length === 1 ? "" : "s"}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap gap-2">
            {overdue.slice(0, 5).map((todo) => (
              <Button
                key={todo.id}
                variant="outline"
                size="sm"
                className="max-w-full"
                onClick={() => setSelected(todo)}
                aria-label={`Open ${todo.title}, due ${todo.date}`}
              >
                <span className="min-w-0 flex-1 truncate">{todo.title}</span>
                <span className="shrink-0 text-muted-foreground">
                  {todo.date}
                  {todo.endTime || todo.startTime ? ` · ${todo.endTime || todo.startTime}` : ""}
                </span>
              </Button>
            ))}
            {overdue.length > 5 && <span>+{overdue.length - 5} more from the last 90 days</span>}
          </AlertDescription>
        </Alert>
      )}
      {dueSoon.length > 0 && (
        <Alert>
          <CalendarDays />
          <AlertTitle>Due in the next three days</AlertTitle>
          <AlertDescription className="flex flex-wrap gap-2">
            {dueSoon.slice(0, 5).map((todo) => (
              <Button
                key={todo.id}
                variant="outline"
                size="sm"
                className="max-w-full"
                onClick={() => setSelected(todo)}
                aria-label={`Open ${todo.title}, due ${todo.date}`}
              >
                <span className="min-w-0 flex-1 truncate">{todo.title}</span>
                <span className="shrink-0 text-muted-foreground">
                  {todo.date}
                  {todo.endTime || todo.startTime ? ` · ${todo.endTime || todo.startTime}` : ""}
                </span>
              </Button>
            ))}
            {dueSoon.length > 5 && <span>+{dueSoon.length - 5} more coming up</span>}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col overflow-hidden rounded-md border">
        <div className="flex flex-col gap-4 border-b bg-sidebar p-4 text-sidebar-foreground lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 shrink-0 flex-col gap-1">
            <div className="font-medium text-lg leading-none">{range.title}</div>
            <p className="text-muted-foreground text-sm">
              {(todos ?? []).filter((todo) => isVisibleScheduleTodo(todo.status)).length +
                (meetings ?? []).filter((meeting) => isVisibleScheduleMeeting(meeting.status)).length}{" "}
              scheduled items
              {(todosLoading || meetingsQuery.isFetching) && <span className="ml-2">· syncing</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {profile?.role === "manager" && teamScheduleKey
                ? `Viewing ${staffQuery.data?.find((person) => person.key === teamScheduleKey)?.name ?? "staff"}’s tasks and meetings shared with you`
                : "Personal to-dos and meetings shared with you"}
              {profile?.role === "manager" ? "; management can view all meetings" : ""} · Africa/Accra
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {profile?.role === "manager" && (
              <Select
                value={teamScheduleKey || "__mine"}
                onValueChange={(value) => setTeamScheduleKey(value === "__mine" ? "" : value)}
              >
                <SelectTrigger aria-label="Choose schedule to view" className="w-full sm:w-52">
                  <SelectValue placeholder="My schedule" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="__mine">My schedule</SelectItem>
                  {(staffQuery.data ?? []).map((person) => (
                    <SelectItem key={person.key} value={person.key}>
                      {person.name}
                      {person.department ? ` · ${person.department}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {profile?.role === "manager" && (
              <Button asChild variant="outline">
                <Link href="/dashboard/operations/reminders">
                  <BellRing /> SMS delivery
                </Link>
              </Button>
            )}
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
              Schedule task
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setMeetingDefaultDate(today);
                setMeetingDefaultStart(undefined);
                setShowMeetingForm(true);
              }}
            >
              <CalendarDays />
              Meeting
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="p-4">
            <QuickAddForm
              defaultDate={quickAddDate}
              onDone={(assignedTo) => {
                if (profile?.role === "manager" && assignedTo)
                  setTeamScheduleKey(assignedTo === profile.key ? "" : assignedTo);
                setShowForm(false);
              }}
            />
          </div>
        )}

        {meetingsQuery.isError && (
          <p role="alert" className="px-4 py-3 text-sm text-destructive">
            Meetings could not be loaded. Your to-dos are still available; refresh the page and try again.
          </p>
        )}
        {todosError && (
          <p role="alert" className="px-4 py-3 text-sm text-destructive">
            Your tasks could not be loaded. Check your connection and refresh to try again.
          </p>
        )}
        {!showForm &&
          !todosLoading &&
          !todosError &&
          !meetingsQuery.isLoading &&
          !meetingsQuery.isError &&
          (todos ?? []).filter((todo) => isVisibleScheduleTodo(todo.status)).length === 0 &&
          (meetings ?? []).filter((meeting) => isVisibleScheduleMeeting(meeting.status)).length === 0 && (
            <div className="mx-4 my-4 flex flex-col gap-3 rounded-lg border border-dashed bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Nothing scheduled for this period</p>
                <p className="text-sm text-muted-foreground">
                  Add a task with its due date, time, assignee, notes, and client reference. Timed tasks can notify the
                  assignee by SMS. Use Week or Agenda to focus on upcoming work.
                </p>
              </div>
              <Button
                onClick={() => {
                  setQuickAddDate(today);
                  setShowForm(true);
                }}
              >
                <Plus />
                Schedule a task
              </Button>
            </div>
          )}

        <ScheduleMeetingComposer
          open={showMeetingForm}
          onOpenChange={setShowMeetingForm}
          profile={profile}
          defaultDate={meetingDefaultDate}
          defaultStartTime={meetingDefaultStart}
        />

        <EventCalendarViews
          controller={controller}
          initialView={VIEWS[0].key}
          initialDate={today}
          timeZone="UTC"
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
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
            setRange({
              title: info.view.title,
              from: calendarDateOnly(info.start),
              to: calendarDateOnly(new Date(info.end.getTime() - 1)),
            });
          }}
        />
      </div>

      {selected && <TodoDetailDialog todo={selected} onClose={() => setSelected(null)} />}
      {selectedMeeting && (
        <ScheduleMeetingDetails
          meeting={selectedMeeting}
          profile={profile}
          onClose={() => setSelectedMeetingId(null)}
        />
      )}
    </div>
  );
}
