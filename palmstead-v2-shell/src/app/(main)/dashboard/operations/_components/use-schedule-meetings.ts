"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { requireSupabase } from "@/lib/supabase.client";

export type MeetingInviteStatus = "invited" | "accepted" | "declined";

export interface MeetingInvitee {
	id: string;
	staffKey: string;
	staffName: string | null;
	status: MeetingInviteStatus;
	respondedAt: string | null;
}

export interface ScheduleMeeting {
	id: string;
	ownerKey: string;
	ownerName: string | null;
	title: string;
	description: string | null;
	date: string;
	startTime: string | null;
	endTime: string | null;
	location: string | null;
	status: string;
	invitees: MeetingInvitee[];
}

export interface ActiveStaffOption {
	key: string;
	name: string;
	department: string | null;
}

interface MeetingRow {
	id: string;
	owner_key: string;
	owner_name: string | null;
	title: string;
	description: string | null;
	item_date: string;
	start_time: string | null;
	end_time: string | null;
	meeting_location: string | null;
	status: string;
}

interface InviteeRow {
	id: string;
	schedule_item_id: string;
	staff_key: string;
	staff_name: string | null;
	status: MeetingInviteStatus;
	responded_at: string | null;
}

const MEETING_COLUMNS =
	"id,owner_key,owner_name,title,description,item_date,start_time,end_time,meeting_location,status";

function mapInvitee(row: InviteeRow): MeetingInvitee {
	return {
		id: row.id,
		staffKey: row.staff_key,
		staffName: row.staff_name,
		status: row.status,
		respondedAt: row.responded_at,
	};
}

function mapMeeting(
	row: MeetingRow,
	invitees: MeetingInvitee[] = [],
): ScheduleMeeting {
	return {
		id: row.id,
		ownerKey: row.owner_key,
		ownerName: row.owner_name,
		title: row.title,
		description: row.description,
		date: row.item_date,
		startTime: row.start_time?.slice(0, 5) ?? null,
		endTime: row.end_time?.slice(0, 5) ?? null,
		location: row.meeting_location,
		status: row.status,
		invitees,
	};
}

async function fetchMeetings(
	fromDate: string,
	toDate: string,
): Promise<ScheduleMeeting[]> {
	const client = requireSupabase();
	const { data, error } = await client
		.from("schedule_items")
		.select(MEETING_COLUMNS)
		.eq("kind", "meeting")
		.gte("item_date", fromDate)
		.lte("item_date", toDate)
		.order("item_date")
		.order("start_time");
	if (error) throw error;

	const rows = (data ?? []) as MeetingRow[];
	if (!rows.length) return [];

	const { data: inviteeData, error: inviteeError } = await client
		.from("schedule_item_invitees")
		.select("id,schedule_item_id,staff_key,staff_name,status,responded_at")
		.in(
			"schedule_item_id",
			rows.map((row) => row.id),
		);
	if (inviteeError) throw inviteeError;

	const inviteesByMeeting = new Map<string, MeetingInvitee[]>();
	((inviteeData ?? []) as InviteeRow[]).forEach((row) => {
		const current = inviteesByMeeting.get(row.schedule_item_id) ?? [];
		current.push(mapInvitee(row));
		inviteesByMeeting.set(row.schedule_item_id, current);
	});
	return rows.map((row) => mapMeeting(row, inviteesByMeeting.get(row.id)));
}

const MEETINGS_KEY = ["operationsMeetings"] as const;

export function useScheduleMeetings(
	agentKey: string | undefined,
	fromDate: string,
	toDate: string,
) {
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: [...MEETINGS_KEY, agentKey, fromDate, toDate],
		queryFn: () => fetchMeetings(fromDate, toDate),
		enabled: Boolean(agentKey),
	});

	useEffect(() => {
		if (!agentKey) return;
		const client = requireSupabase();
		const invalidate = () =>
			void queryClient.invalidateQueries({ queryKey: MEETINGS_KEY });
		const channel = client
			.channel(`operations-meetings:${agentKey}`)
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "schedule_items" },
				invalidate,
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "schedule_item_invitees",
				},
				invalidate,
			)
			.subscribe();
		return () => {
			void client.removeChannel(channel);
		};
	}, [agentKey, queryClient]);

	return query;
}

export function useActiveMeetingStaff() {
	return useQuery({
		queryKey: ["operationsMeetingStaff"],
		queryFn: async (): Promise<ActiveStaffOption[]> => {
			const { data, error } = await requireSupabase()
				.from("profiles")
				.select("agent_key,name,department")
				.eq("active", true)
				.order("name");
			if (error) throw error;
			return (data ?? []).flatMap(
				(row: {
					agent_key: string | null;
					name: string;
					department: string | null;
				}) =>
					row.agent_key
						? [
								{
									key: row.agent_key,
									name: row.name,
									department: row.department,
								},
							]
						: [],
			);
		},
	});
}

export interface NewMeetingInput {
	ownerKey: string;
	ownerName: string;
	title: string;
	description: string;
	date: string;
	startTime: string;
	endTime: string;
	location: string;
	inviteeKeys: string[];
}

export function useCreateScheduleMeeting() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: NewMeetingInput) => {
			const client = requireSupabase();
			const { data, error } = await client
				.from("schedule_items")
				.insert({
					kind: "meeting",
					owner_key: input.ownerKey,
					owner_name: input.ownerName,
					assigned_to: input.ownerKey,
					assigned_to_name: input.ownerName,
					assigned_by: input.ownerKey,
					assigned_by_name: input.ownerName,
					title: input.title.trim(),
					description: input.description.trim() || null,
					item_date: input.date,
					start_time: input.startTime,
					end_time: input.endTime,
					meeting_location: input.location.trim() || null,
					status: "open",
				})
				.select(MEETING_COLUMNS)
				.single();
			if (error) throw error;

			const inviteeKeys = [...new Set(input.inviteeKeys)].filter(
				(key) => key !== input.ownerKey,
			);
			if (inviteeKeys.length) {
				const { error: inviteError } = await client
					.from("schedule_item_invitees")
					.insert(
						inviteeKeys.map((staffKey) => ({
							schedule_item_id: data.id,
							staff_key: staffKey,
							staff_name: null,
						})),
					);
				if (inviteError) {
					await client.from("schedule_items").delete().eq("id", data.id);
					throw inviteError;
				}
			}
			return mapMeeting(data as MeetingRow);
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: MEETINGS_KEY }),
	});
}

export function useUpdateScheduleMeeting() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			patch,
		}: {
			id: string;
			patch: Partial<
				Pick<
					ScheduleMeeting,
					| "title"
					| "description"
					| "date"
					| "startTime"
					| "endTime"
					| "location"
					| "status"
				>
			>;
		}) => {
			const values: Record<string, string | null> = {};
			if (patch.title !== undefined) values.title = patch.title.trim();
			if (patch.description !== undefined)
				values.description = patch.description?.trim() || null;
			if (patch.date !== undefined) values.item_date = patch.date;
			if (patch.startTime !== undefined) values.start_time = patch.startTime;
			if (patch.endTime !== undefined) values.end_time = patch.endTime;
			if (patch.location !== undefined)
				values.meeting_location = patch.location?.trim() || null;
			if (patch.status !== undefined) values.status = patch.status;
			const { error } = await requireSupabase()
				.from("schedule_items")
				.update(values)
				.eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: MEETINGS_KEY }),
	});
}

export function useRespondToScheduleMeeting() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			inviteeId,
			response,
		}: {
			inviteeId: string;
			response: "accepted" | "declined";
		}) => {
			const { error } = await requireSupabase().rpc(
				"respond_to_schedule_invite",
				{
					p_invitee_id: inviteeId,
					p_response: response,
				},
			);
			if (error) throw error;
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: MEETINGS_KEY }),
	});
}
