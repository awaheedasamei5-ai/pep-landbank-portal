"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { CalendarDays, Check, Clock3, MapPin, Users, X } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Profile } from "@/lib/palmstead/types";

import {
	type ScheduleMeeting,
	useActiveMeetingStaff,
	useCreateScheduleMeeting,
	useReplaceScheduleMeetingInvitees,
	useRespondToScheduleMeeting,
	useUpdateScheduleMeeting,
} from "./use-schedule-meetings";

function inviteeStatusVariant(
	status: string,
): "default" | "destructive" | "outline" {
	if (status === "accepted") return "default";
	if (status === "declined") return "destructive";
	return "outline";
}

function todayDate() {
	const date = new Date();
	const offset = date.getTimezoneOffset();
	return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function ScheduleMeetingComposer({
	open,
	onOpenChange,
	profile,
	defaultDate,
	defaultStartTime,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	profile: Profile | null;
	defaultDate: string;
	defaultStartTime?: string;
}) {
	const staffQuery = useActiveMeetingStaff();
	const createMeeting = useCreateScheduleMeeting();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [date, setDate] = useState(defaultDate || todayDate());
	const [startTime, setStartTime] = useState(defaultStartTime ?? "09:00");
	const [endTime, setEndTime] = useState("09:30");
	const [location, setLocation] = useState("");
	const [search, setSearch] = useState("");
	const [inviteeKeys, setInviteeKeys] = useState<string[]>([]);

	useEffect(() => {
		if (!open) return;
		setTitle("");
		setDescription("");
		setDate(defaultDate || todayDate());
		const start = defaultStartTime ?? "09:00";
		setStartTime(start);
		const [hour, minute] = start.split(":").map(Number);
		const end = new Date(2000, 0, 1, hour, minute + 30);
		setEndTime(
			`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
		);
		setLocation("");
		setSearch("");
		setInviteeKeys([]);
	}, [defaultDate, defaultStartTime, open]);

	const activeStaff = useMemo(
		() =>
			(staffQuery.data ?? []).filter((person) => person.key !== profile?.key),
		[profile?.key, staffQuery.data],
	);
	const filteredStaff = activeStaff.filter((person) =>
		`${person.name} ${person.department ?? ""}`
			.toLowerCase()
			.includes(search.trim().toLowerCase()),
	);
	const isValid = Boolean(
		title.trim() && date && startTime && endTime && endTime > startTime,
	);

	async function submit() {
		if (!profile || !isValid) return;
		await createMeeting.mutateAsync({
			title,
			description,
			date,
			startTime,
			endTime,
			location,
			inviteeKeys,
		});
		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Schedule a meeting</DialogTitle>
					<p className="text-sm text-muted-foreground">
						Times use Palmstead&apos;s Africa/Accra workspace time. Invitations appear in
						Operations for invited staff; this does not send email or SMS.
					</p>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="grid gap-2">
						<Label htmlFor="meeting-title">Meeting title</Label>
						<Input
							id="meeting-title"
							autoFocus
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							maxLength={160}
							placeholder="e.g. Weekly operations review"
						/>
					</div>
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="grid gap-2 sm:col-span-1">
							<Label htmlFor="meeting-date">Date</Label>
							<Input
								id="meeting-date"
								type="date"
								value={date}
								onChange={(event) => setDate(event.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="meeting-start">Starts</Label>
							<Input
								id="meeting-start"
								type="time"
								value={startTime}
								onChange={(event) => setStartTime(event.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="meeting-end">Ends</Label>
							<Input
								id="meeting-end"
								type="time"
								value={endTime}
								onChange={(event) => setEndTime(event.target.value)}
							/>
						</div>
					</div>
					{startTime && endTime && endTime <= startTime && (
						<p role="alert" className="text-sm text-destructive">
							End time must be after start time on the same day.
						</p>
					)}
					<div className="grid gap-2">
						<Label htmlFor="meeting-location">Location</Label>
						<Input
							id="meeting-location"
							value={location}
							onChange={(event) => setLocation(event.target.value)}
							placeholder="Office, conference room, or meeting point"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="meeting-description">Agenda or notes</Label>
						<Textarea
							id="meeting-description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							rows={3}
							placeholder="Add context attendees need before the meeting."
						/>
					</div>
					<section
						className="grid gap-2"
						aria-labelledby="meeting-invitees-label"
					>
						<div className="flex items-center justify-between gap-3">
							<Label id="meeting-invitees-label">Invite staff</Label>
							<span className="text-xs text-muted-foreground">
								{inviteeKeys.length} selected
							</span>
						</div>
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Find a colleague"
							aria-label="Search staff to invite"
						/>
						<div className="max-h-48 overflow-y-auto rounded-md border">
							{staffQuery.isLoading && (
								<p className="p-3 text-sm text-muted-foreground">
									Loading staff…
								</p>
							)}
							{staffQuery.isError && (
								<p role="alert" className="p-3 text-sm text-destructive">
									Staff list could not be loaded. Try again before sending
									invitations.
								</p>
							)}
							{!staffQuery.isLoading &&
								!staffQuery.isError &&
								filteredStaff.length === 0 && (
									<p className="p-3 text-sm text-muted-foreground">
										No active staff match that search.
									</p>
								)}
							{filteredStaff.map((person) => (
								<div
									key={person.key}
									className="flex min-h-11 cursor-pointer items-center gap-3 border-b px-3 last:border-0 hover:bg-muted/50"
								>
									<Checkbox
										id={`invitee-${person.key}`}
										checked={inviteeKeys.includes(person.key)}
										onCheckedChange={(checked) =>
											setInviteeKeys((current) =>
												checked
													? [...current, person.key]
													: current.filter((key) => key !== person.key),
											)
										}
									/>
									<label
										htmlFor={`invitee-${person.key}`}
										className="min-w-0 flex-1 cursor-pointer truncate text-sm"
									>
										{person.name}
									</label>
									{person.department && (
										<span className="truncate text-xs text-muted-foreground">
											{person.department}
										</span>
									)}
								</div>
							))}
						</div>
					</section>
					{createMeeting.isError && (
						<p role="alert" className="text-sm text-destructive">
							{createMeeting.error.message || "The meeting could not be saved."}
						</p>
					)}
				</div>
				<DialogFooter className="flex-col-reverse sm:flex-row">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
					<Button
						onClick={() => void submit()}
						disabled={
							!isValid ||
							!profile ||
							createMeeting.isPending ||
							staffQuery.isError
						}
					>
						{createMeeting.isPending
							? "Saving…"
							: `Save meeting${inviteeKeys.length ? ` · invite ${inviteeKeys.length}` : ""}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ScheduleMeetingDetails({
	meeting,
	profile,
	onClose,
}: {
	meeting: ScheduleMeeting;
	profile: Profile | null;
	onClose: () => void;
}) {
	const staffQuery = useActiveMeetingStaff();
	const updateMeeting = useUpdateScheduleMeeting();
	const replaceInvitees = useReplaceScheduleMeetingInvitees();
	const respond = useRespondToScheduleMeeting();
	const [title, setTitle] = useState(meeting.title);
	const [description, setDescription] = useState(meeting.description ?? "");
	const [date, setDate] = useState(meeting.date);
	const [startTime, setStartTime] = useState(meeting.startTime ?? "09:00");
	const [endTime, setEndTime] = useState(meeting.endTime ?? "09:30");
	const [location, setLocation] = useState(meeting.location ?? "");
	const [editing, setEditing] = useState(false);
	const [editingInvitees, setEditingInvitees] = useState(false);
	const [inviteeSearch, setInviteeSearch] = useState("");
	const [selectedInviteeKeys, setSelectedInviteeKeys] = useState<string[]>(
		meeting.invitees.map((invitee) => invitee.staffKey),
	);
	const [feedback, setFeedback] = useState<string | null>(null);
	const canManage =
		profile?.role === "manager" || profile?.key === meeting.ownerKey;
	const ownInvite = meeting.invitees.find(
		(invitee) => invitee.staffKey === profile?.key,
	);
	const staffNames = new Map(
		(staffQuery.data ?? []).map((person) => [person.key, person.name]),
	);
	const cancelled = meeting.status === "cancelled";
	const inviteeOptions = useMemo(() => {
		const active = staffQuery.data ?? [];
		const activeKeys = new Set(active.map((person) => person.key));
		const existing = meeting.invitees
			.filter((invitee) => !activeKeys.has(invitee.staffKey))
			.map((invitee) => ({
				key: invitee.staffKey,
				name: invitee.staffName || invitee.staffKey,
				department: "Inactive staff",
			}));
		return [...active, ...existing].filter(
			(person) => person.key !== meeting.ownerKey,
		);
	}, [meeting.invitees, meeting.ownerKey, staffQuery.data]);
	const filteredInviteeOptions = inviteeOptions.filter((person) =>
		`${person.name} ${person.department ?? ""}`
			.toLowerCase()
			.includes(inviteeSearch.trim().toLowerCase()),
	);
	let inviteeContent: ReactNode;
	if (canManage && meeting.invitees.length > 0) {
		inviteeContent = (
			<div className="divide-y rounded-md border">
				{meeting.invitees.map((invitee) => (
					<div
						key={invitee.id}
						className="flex items-center justify-between gap-3 px-3 py-2"
					>
						<span className="min-w-0 truncate text-sm">
							{invitee.staffName ||
								staffNames.get(invitee.staffKey) ||
								invitee.staffKey}
						</span>
						<Badge
							variant={inviteeStatusVariant(invitee.status)}
						>
							{invitee.status === "invited"
								? "Needs response"
								: invitee.status}
						</Badge>
					</div>
				))}
			</div>
		);
	} else if (ownInvite) {
		inviteeContent = (
			<p className="text-sm text-muted-foreground">
				Your response: {ownInvite.status === "invited" ? "Needs response" : ownInvite.status}.
				 Attendee responses are visible to the organizer and management.
			</p>
		);
	} else if (meeting.invitees.length > 0) {
		inviteeContent = (
			<p className="text-sm text-muted-foreground">
				Attendee details are limited to the organizer and management.
			</p>
		);
	} else {
		inviteeContent = (
			<p className="text-sm text-muted-foreground">No staff were invited.</p>
		);
	}

	useEffect(() => {
		setTitle(meeting.title);
		setDescription(meeting.description ?? "");
		setDate(meeting.date);
		setStartTime(meeting.startTime ?? "09:00");
		setEndTime(meeting.endTime ?? "09:30");
		setLocation(meeting.location ?? "");
		setEditing(false);
		setEditingInvitees(false);
		setSelectedInviteeKeys(meeting.invitees.map((invitee) => invitee.staffKey));
		setInviteeSearch("");
		setFeedback(null);
	}, [meeting]);

	async function saveInvitees() {
		try {
			const result = await replaceInvitees.mutateAsync({
				id: meeting.id,
				inviteeKeys: selectedInviteeKeys,
			});
			setFeedback(
				`Invitees updated. ${result.added} added and ${result.removed} removed. Retained responses are unchanged.`,
			);
			setEditingInvitees(false);
		} catch (error) {
			setFeedback(
				error instanceof Error ? error.message : "Invitees could not be updated.",
			);
		}
	}

	async function save() {
		if (
			!title.trim() ||
			!date ||
			!startTime ||
			!endTime ||
			endTime <= startTime
		)
			return;
		try {
			await updateMeeting.mutateAsync({
				id: meeting.id,
				patch: { title, description, date, startTime, endTime, location },
			});
			setFeedback(
				"Meeting updated. Invitees will see the latest details in Operations.",
			);
			setEditing(false);
		} catch (error) {
			setFeedback(
				error instanceof Error ? error.message : "Meeting update failed.",
			);
		}
	}

	async function cancelMeeting() {
		try {
			await updateMeeting.mutateAsync({
				id: meeting.id,
				patch: { status: "cancelled" },
			});
			setFeedback("Meeting cancelled.");
		} catch (error) {
			setFeedback(
				error instanceof Error ? error.message : "Meeting cancellation failed.",
			);
		}
	}

	async function sendResponse(response: "accepted" | "declined") {
		if (!ownInvite) return;
		try {
			await respond.mutateAsync({ inviteeId: ownInvite.id, response });
			setFeedback(
				response === "accepted"
					? "You accepted the invitation."
					: "You declined the invitation.",
			);
		} catch (error) {
			setFeedback(
				error instanceof Error
					? error.message
					: "Your response could not be saved.",
			);
		}
	}

	let inviteeEditorContent: ReactNode;
	if (staffQuery.isError) {
		inviteeEditorContent = (
			<p role="alert" className="p-3 text-sm text-destructive">
				Staff could not be loaded. Try again before saving.
			</p>
		);
	} else if (staffQuery.isLoading) {
		inviteeEditorContent = (
			<p className="p-3 text-sm text-muted-foreground">Loading staff…</p>
		);
	} else if (filteredInviteeOptions.length === 0) {
		inviteeEditorContent = (
			<p className="p-3 text-sm text-muted-foreground">
				No staff match that search.
			</p>
		);
	} else {
		inviteeEditorContent = filteredInviteeOptions.map((person) => (
			<div
				key={person.key}
				className="flex min-h-11 items-center gap-3 border-b px-3 last:border-0"
			>
				<Checkbox
					id={`edit-invitee-${person.key}`}
					checked={selectedInviteeKeys.includes(person.key)}
					onCheckedChange={(checked) =>
						setSelectedInviteeKeys((current) =>
							checked
								? [...current, person.key]
								: current.filter((key) => key !== person.key),
						)
					}
				/>
				<label
					htmlFor={`edit-invitee-${person.key}`}
					className="min-w-0 flex-1 cursor-pointer truncate text-sm"
				>
					{person.name}
				</label>
				{person.department && (
					<span className="text-xs text-muted-foreground">
						{person.department}
					</span>
				)}
			</div>
		));
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<div className="flex flex-wrap items-center gap-2 pr-6">
						<DialogTitle className="min-w-0 flex-1">
							{editing ? "Edit meeting" : meeting.title}
						</DialogTitle>
						{cancelled && <Badge variant="destructive">Cancelled</Badge>}
					</div>
				</DialogHeader>
				{editing ? (
					<div className="grid gap-3 sm:grid-cols-2">
						<Input
							aria-label="Meeting title"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							className="sm:col-span-2"
						/>
						<Input
							aria-label="Date"
							type="date"
							value={date}
							onChange={(event) => setDate(event.target.value)}
						/>
						<Input
							aria-label="Location"
							value={location}
							onChange={(event) => setLocation(event.target.value)}
							placeholder="Location"
						/>
						<Input
							aria-label="Start time"
							type="time"
							value={startTime}
							onChange={(event) => setStartTime(event.target.value)}
						/>
						<Input
							aria-label="End time"
							type="time"
							value={endTime}
							onChange={(event) => setEndTime(event.target.value)}
						/>
						<Textarea
							aria-label="Agenda or notes"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							rows={4}
							className="sm:col-span-2"
						/>
					</div>
				) : (
					<div className="grid gap-4">
						<div className="grid gap-2 text-sm">
							<p className="flex items-center gap-2">
								<CalendarDays className="size-4 text-muted-foreground" />
								{meeting.date}
							</p>
							<p className="flex items-center gap-2">
								<Clock3 className="size-4 text-muted-foreground" />
								{meeting.startTime ?? "Time not set"}
								{meeting.endTime ? `–${meeting.endTime}` : ""} · Africa/Accra
							</p>
							{meeting.location && (
								<p className="flex items-center gap-2">
									<MapPin className="size-4 text-muted-foreground" />
									{meeting.location}
								</p>
							)}
							{meeting.description && (
								<p className="whitespace-pre-wrap text-muted-foreground">
									{meeting.description}
								</p>
							)}
							<p className="text-xs text-muted-foreground">
								Organized by {meeting.ownerName ?? meeting.ownerKey}
							</p>
						</div>
						<section
							className="grid gap-2"
							aria-labelledby="attendee-list-label"
						>
							<div className="flex items-center gap-2">
								<Users className="size-4 text-muted-foreground" />
								<h3 id="attendee-list-label" className="font-medium text-sm">
									Invitees
								</h3>
								<span className="text-xs text-muted-foreground">
									{meeting.invitees.length}
								</span>
							</div>
							{canManage && !cancelled && (
								<div className="flex flex-wrap gap-2">
									{editingInvitees ? (
										<>
											<Button size="sm" variant="outline" onClick={() => {
												setSelectedInviteeKeys(meeting.invitees.map((invitee) => invitee.staffKey));
												setEditingInvitees(false);
											}}>Discard changes</Button>
											<Button size="sm" onClick={() => void saveInvitees()} disabled={replaceInvitees.isPending || staffQuery.isLoading || staffQuery.isError}>
												{replaceInvitees.isPending ? "Saving…" : "Save invitees"}
											</Button>
										</>
									) : (
										<Button size="sm" variant="outline" onClick={() => setEditingInvitees(true)}>Edit invitees</Button>
									)}
								</div>
							)}
							{editingInvitees ? (
								<div className="grid gap-2">
									<p className="text-xs text-muted-foreground">Retained staff keep their current response. Removed staff lose access to this invitation.</p>
									<Input value={inviteeSearch} onChange={(event) => setInviteeSearch(event.target.value)} placeholder="Search staff" aria-label="Search meeting invitees" />
									<div className="max-h-52 overflow-y-auto rounded-md border">
							{inviteeEditorContent}
									</div>
								</div>
							) : inviteeContent}</section>
					</div>
				)}
				{feedback && (
					<p aria-live="polite" className="text-sm text-muted-foreground">
						{feedback}
					</p>
				)}
				{editing && endTime <= startTime && (
					<p role="alert" className="text-sm text-destructive">
						End time must be after start time.
					</p>
				)}
				<DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
					<div className="flex flex-wrap gap-2">
						{ownInvite && !cancelled && (
							<>
								<Button
									size="sm"
									onClick={() => void sendResponse("accepted")}
									disabled={respond.isPending}
								>
									<Check />{" "}
									{ownInvite.status === "accepted" ? "Accepted" : "Accept"}
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => void sendResponse("declined")}
									disabled={respond.isPending}
								>
									<X />{" "}
									{ownInvite.status === "declined" ? "Declined" : "Decline"}
								</Button>
							</>
						)}
					</div>
					{canManage && !cancelled && (
						<div className="flex flex-wrap justify-end gap-2">
							{editing ? (
								<>
									<Button variant="outline" onClick={() => setEditing(false)}>
										Discard
									</Button>
									<Button
										onClick={() => void save()}
										disabled={
											updateMeeting.isPending ||
											!title.trim() ||
											endTime <= startTime
										}
									>
										Save changes
									</Button>
								</>
							) : (
								<>
									<Button variant="outline" onClick={() => setEditing(true)}>
										Edit
									</Button>
									<ConfirmDialog
										trigger={
											<Button
												variant="destructive"
												disabled={updateMeeting.isPending}
											>
												Cancel meeting
											</Button>
										}
										title="Cancel this meeting?"
										description="The meeting will remain in the schedule as cancelled so attendees can see what changed."
										confirmLabel="Cancel meeting"
										onConfirm={cancelMeeting}
									/>
								</>
							)}
						</div>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
