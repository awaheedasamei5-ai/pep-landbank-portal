"use client";

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
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import {
	AlertTriangle,
	CalendarDays,
	Check,
	ChevronLeft,
	ChevronRight,
	Plus,
	Trash2,
	X,
	XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EventCalendarViews } from "@/components/calendar/event-calendar-views";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isoDateOnly } from "@/lib/palmstead/format";
import { useAuthStore } from "@/stores/auth/auth-store";
import { getScheduleUrgency } from "./schedule-urgency";
import {
	ScheduleMeetingComposer,
	ScheduleMeetingDetails,
} from "./schedule-meetings-dialogs";
import {
	checkScheduleConflicts,
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
import {
	type ScheduleMeeting,
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
	const start = todo.startTime
		? `${todo.date}T${todo.startTime}:00`
		: todo.date;
	const end = todo.endTime ? `${todo.date}T${todo.endTime}:00` : undefined;
	return {
		id: todo.id,
		title: todo.status === "done" ? `✓ ${todo.title}` : todo.title,
		start,
		end,
		allDay: !todo.startTime,
		color: STATUS_COLOR[todo.status],
		classNames:
			todo.status === "cancelled" || todo.status === "rescheduled"
				? ["opacity-40", "line-through"]
				: [],
		extendedProps: { kind: "todo", todo },
	};
}

function toMeetingEvent(
	meeting: ScheduleMeeting,
	canEdit: boolean,
): EventInput {
	return {
		id: `meeting:${meeting.id}`,
		title: `Meeting · ${meeting.title}`,
		start: meeting.startTime
			? `${meeting.date}T${meeting.startTime}:00`
			: meeting.date,
		end: meeting.endTime ? `${meeting.date}T${meeting.endTime}:00` : undefined,
		allDay: !meeting.startTime,
		color: "var(--chart-2)",
		editable: canEdit && meeting.status !== "cancelled",
		classNames:
			meeting.status === "cancelled" ? ["opacity-50", "line-through"] : [],
		extendedProps: { kind: "meeting", meeting },
	};
}

function TodoDetailDialog({
	todo,
	onClose,
}: {
	todo: Todo;
	onClose: () => void;
}) {
	const updateStatus = useUpdateTodoStatus();
	const updateTodo = useUpdateTodo();
	const deleteTodo = useDeleteTodo();
	const [title, setTitle] = useState(todo.title);
	const [notes, setNotes] = useState(todo.notes ?? "");

	async function saveEdits() {
		if (title !== todo.title || notes !== (todo.notes ?? "")) {
			await updateTodo.mutateAsync({
				todo,
				patch: { title, notes: notes || null },
			});
		}
	}

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{todo.date}
						{todo.startTime ? ` · ${todo.startTime}–${todo.endTime ?? ""}` : ""}
					</DialogTitle>
				</DialogHeader>
				<div className="grid gap-3">
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Title"
					/>
					<Textarea
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder="Notes"
						rows={3}
					/>
					{todo.escalatedToName && (
						<p className="text-muted-foreground text-xs">
							Escalated to {todo.escalatedToName}
							{todo.escalationNote && `: "${todo.escalationNote}"`}
						</p>
					)}
					{todo.recursFreq && (
						<Badge variant="outline">Repeats {todo.recursFreq}</Badge>
					)}
				</div>
				<DialogFooter className="flex-wrap gap-2 sm:justify-between">
					<div className="flex flex-wrap gap-2">
						{(title !== todo.title || notes !== (todo.notes ?? "")) && (
							<Button size="sm" variant="outline" disabled={updateTodo.isPending} onClick={() => saveEdits().then(onClose)}>
								Save changes
							</Button>
						)}
						{todo.status === "open" && (
							<Button
								size="sm"
								onClick={() =>
									updateStatus
										.mutateAsync({ todo, status: "done" })
										.then(onClose)
								}
							>
								<Check />
								Mark done
							</Button>
						)}
						{todo.status === "open" && (
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									updateStatus
										.mutateAsync({ todo, status: "cancelled" })
										.then(onClose)
								}
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

function QuickAddForm({
	defaultDate,
	onDone,
}: {
	defaultDate: string;
	onDone: () => void;
}) {
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
	const [conflict, setConflict] = useState<{
		title: string;
		startTime: string;
		endTime: string;
	} | null>(null);

	// Real-time collision detection -- same real V1 logic
	// (apiCheckScheduleConflicts/scheduleConflictReasonText) this app
	// already uses for Operations Tracker issue escalation, applied here:
	// queried live against the real op_todos table on every start/end
	// time change, not computed off whatever's already loaded in the
	// visible calendar range.
	useEffect(() => {
		if (!profile?.key || !startTime || !endTime) {
			setConflict(null);
			return;
		}
		let cancelled = false;
		const timer = setTimeout(async () => {
			const hits = await checkScheduleConflicts(
				profile.key,
				date,
				startTime,
				endTime,
			);
			if (!cancelled) setConflict(hits[0] ?? null);
		}, 300);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [profile?.key, date, startTime, endTime]);

	async function submit() {
		if (!title.trim()) return;
		const input = {
			title: title.trim(),
			notes: null,
			contact: null,
			date,
			startTime: startTime || null,
			endTime: endTime || null,
		};
		if (repeat) {
			await createRecurring.mutateAsync({
				...input,
				recur: { freq, interval: 1, until: until || null },
			});
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
				<Input
					placeholder="What do you need to do?"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Input
						type="date"
						value={date}
						onChange={(e) => setDate(e.target.value)}
						className="w-40"
					/>
					<Input
						type="time"
						value={startTime}
						onChange={(e) => setStartTime(e.target.value)}
						className="w-32"
						placeholder="Start"
					/>
					<Input
						type="time"
						value={endTime}
						onChange={(e) => setEndTime(e.target.value)}
						className="w-32"
						placeholder="End"
					/>
				</div>
				{conflict && (
					<p className="flex items-center gap-1.5 text-amber-600 text-xs dark:text-amber-400">
						<AlertTriangle className="size-3.5" />
						You already have &quot;{conflict.title}&quot; {conflict.startTime}–
						{conflict.endTime} that day.
					</p>
				)}
				<div className="flex items-center gap-2 text-sm">
					<Switch
						id="repeat-todo"
						checked={repeat}
						onCheckedChange={setRepeat}
					/>
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
				<SubmitButton
					type="button"
					loading={createTodo.isPending || createRecurring.isPending}
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
		const setResponsiveView = () =>
			controller.changeView(mobile.matches ? "listWeek" : "dayGridMonth");
		setResponsiveView();
		mobile.addEventListener("change", setResponsiveView);
		return () => mobile.removeEventListener("change", setResponsiveView);
	}, [controller]);
	const reschedule = useRescheduleTodo(profile?.key, profile?.name);
	const updateMeeting = useUpdateScheduleMeeting();
	const [showForm, setShowForm] = useState(false);
	const [showMeetingForm, setShowMeetingForm] = useState(false);
	const [selected, setSelected] = useState<Todo | null>(null);
	const [now, setNow] = useState(() => new Date());
	const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(
		null,
	);
	const [meetingDefaultDate, setMeetingDefaultDate] = useState(
		isoDateOnly(new Date()),
	);
	const [meetingDefaultStart, setMeetingDefaultStart] = useState<
		string | undefined
	>();
	const [range, setRange] = useState(() => ({
		title: format(new Date(), "MMMM yyyy"),
		from: isoDateOnly(startOfMonth(new Date())),
		to: isoDateOnly(endOfMonth(new Date())),
	}));
	useEffect(() => {
		const timer = window.setInterval(() => setNow(new Date()), 60_000);
		return () => window.clearInterval(timer);
	}, []);

	// Keep the action queue anchored to today even when the calendar is
	// browsed to another month. This query is bounded to recent overdue work
	// and near-term tasks, independent of the visible calendar range.
	const { data: todos } = useMySchedule(profile?.key, range.from, range.to);
	const today = isoDateOnly(now);
	const triageTodos = useMySchedule(
		profile?.key,
		isoDateOnly(addDays(now, -90)),
		isoDateOnly(addDays(now, 3)),
	);
	const meetingsQuery = useScheduleMeetings(profile?.key, range.from, range.to);
	const meetings = meetingsQuery.data;

	const events = useMemo(
		() => [
			...(todos ?? []).map(toEventInput),
			...(meetings ?? []).map((meeting) =>
				toMeetingEvent(
					meeting,
					profile?.role === "manager" || meeting.ownerKey === profile?.key,
				),
			),
		],
		[meetings, profile?.key, profile?.role, todos],
	);
	const selectedMeeting =
		meetings?.find((meeting) => meeting.id === selectedMeetingId) ?? null;

	const urgency = useMemo(
		() =>
			getScheduleUrgency(
				triageTodos.data ?? [],
				now,
				addDays(now, 3),
			),
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
		const newDate = isoDateOnly(newStart);
		if (props.kind === "meeting" && props.meeting) {
			try {
				await updateMeeting.mutateAsync({
					id: props.meeting.id,
					patch: {
						date: newDate,
						startTime: format(newStart, "HH:mm"),
						endTime: info.event.end
							? format(info.event.end, "HH:mm")
							: props.meeting.endTime,
					},
				});
			} catch {
				info.revert();
			}
			return;
		}
		const todo = props.todo;
		if (!todo) return;
		const newStartTime = todo.startTime ? format(newStart, "HH:mm") : null;
		const newEndTime = info.event.end
			? format(info.event.end, "HH:mm")
			: todo.endTime;
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
						date: isoDateOnly(newStart),
						startTime: format(newStart, "HH:mm"),
						endTime: format(newEnd, "HH:mm"),
					},
				});
			} else if (props.todo) {
				await reschedule.mutateAsync({
					todo: props.todo,
					newDate: isoDateOnly(newStart),
					newStart: format(newStart, "HH:mm"),
					newEnd: format(newEnd, "HH:mm"),
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
		if (props.kind === "meeting" && props.meeting)
			setSelectedMeetingId(props.meeting.id);
		else if (props.todo) setSelected(props.todo);
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
				<Alert
					variant="destructive"
					className="border-destructive/40 bg-destructive/5"
				>
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
								<span className="min-w-0 flex-1 truncate">
									{todo.title}
								</span>
								<span className="shrink-0 text-muted-foreground">
									{todo.date}
									{todo.endTime || todo.startTime
										? ` · ${todo.endTime || todo.startTime}`
										: ""}
								</span>
							</Button>
						))}
						{overdue.length > 5 && (
							<span>
								+{overdue.length - 5} more from the last 90 days
							</span>
						)}
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
								<span className="min-w-0 flex-1 truncate">
									{todo.title}
								</span>
								<span className="shrink-0 text-muted-foreground">
									{todo.date}
									{todo.endTime || todo.startTime
										? ` · ${todo.endTime || todo.startTime}`
										: ""}
								</span>
							</Button>
						))}
						{dueSoon.length > 5 && (
							<span>+{dueSoon.length - 5} more coming up</span>
						)}
					</AlertDescription>
				</Alert>
			)}

			<div className="flex flex-col overflow-hidden rounded-md border">
				<div className="flex flex-col gap-4 border-b bg-sidebar p-4 text-sidebar-foreground lg:flex-row lg:items-center lg:justify-between">
					<div className="flex min-w-0 shrink-0 flex-col gap-1">
						<div className="font-medium text-lg leading-none">
							{range.title}
						</div>
						<p className="text-muted-foreground text-sm">
							{(todos ?? []).filter((t) => t.status !== "rescheduled").length +
								(meetings ?? []).filter(
									(meeting) => meeting.status !== "cancelled",
								).length}{" "}
							scheduled items
							{meetingsQuery.isFetching && (
								<span className="ml-2">· syncing</span>
							)}
						</p>
						<p className="text-xs text-muted-foreground">
							Personal to-dos and meetings shared with you
							{profile?.role === "manager"
								? "; management can view all meetings"
								: ""}{" "}
							· Africa/Accra
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<ButtonGroup>
							<Button
								size="icon"
								variant="outline"
								onClick={() => controller.prev()}
							>
								<ChevronLeft />
							</Button>
							<Button variant="outline" onClick={() => controller.today()}>
								Today
							</Button>
							<Button
								size="icon"
								variant="outline"
								onClick={() => controller.next()}
							>
								<ChevronRight />
							</Button>
						</ButtonGroup>
						<Select
							value={controller.view?.type ?? VIEWS[0].key}
							onValueChange={(v) => controller.changeView(v)}
						>
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
							To-do
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
							onDone={() => setShowForm(false)}
						/>
					</div>
				)}

				{meetingsQuery.isError && (
					<p role="alert" className="px-4 py-3 text-sm text-destructive">
						Meetings could not be loaded. Your to-dos are still available;
						refresh the page and try again.
					</p>
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
					plugins={[
						dayGridPlugin,
						timeGridPlugin,
						listPlugin,
						interactionPlugin,
					]}
					popoverCloseContent={() => (
						<XIcon className="size-5 text-muted-foreground group-hover:text-foreground" />
					)}
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
							from: isoDateOnly(info.start),
							to: isoDateOnly(info.end),
						});
					}}
				/>
			</div>

			{selected && (
				<TodoDetailDialog todo={selected} onClose={() => setSelected(null)} />
			)}
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

