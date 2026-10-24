"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";
import { findScheduleConflicts } from "./schedule-conflicts";
import { addScheduleDays } from "./schedule-time.ts";

// Real day/week/month personal planner ("My Schedule"), ported from V1's
// real schedule_items (kind='todo') logic -- apiLoadTodos/apiInsertTodo/
// apiInsertRecurringTodo/apiRescheduleTodo/apiCheckScheduleConflicts,
// commit history confirmed live in index.html (main branch). Deliberately
// NOT the multi-attendee invite half (schedule_item_invitees) -- that's a
// separate, larger feature (real "Calendar" aggregation, Part C of the
// OSS item-2 plan), not what was asked for here.
export type TodoStatus = "open" | "done" | "cancelled" | "rescheduled";
export type RecurFreq = "daily" | "weekly" | "monthly";

export interface Todo {
  id: string;
  ownerKey: string;
  ownerName: string;
  assignedTo: string;
  assignedToName: string;
  title: string;
  notes: string | null;
  contact: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: TodoStatus;
  rescheduledToId: string | null;
  escalatedTo: string | null;
  escalatedToName: string | null;
  escalationNote: string | null;
  recursFreq: RecurFreq | null;
  recursInterval: number | null;
  recursUntil: string | null;
  recursParentId: string | null;
  createdAt: string;
  completedAt: string | null;
}

type Raw = {
  id: string;
  owner_key: string;
  owner_name: string;
  assigned_to: string;
  assigned_to_name: string;
  title: string;
  notes: string | null;
  contact: string | null;
  item_date: string;
  start_time: string | null;
  end_time: string | null;
  status: TodoStatus;
  rescheduled_to_id: string | null;
  escalated_to: string | null;
  escalated_to_name: string | null;
  escalation_note: string | null;
  recurs_freq: RecurFreq | null;
  recurs_interval: number | null;
  recurs_until: string | null;
  recurs_parent_id: string | null;
  created_at: string;
  completed_at: string | null;
};

function mapTodo(r: Raw): Todo {
  return {
    id: r.id,
    ownerKey: r.owner_key,
    ownerName: r.owner_name,
    assignedTo: r.assigned_to,
    assignedToName: r.assigned_to_name,
    title: r.title,
    notes: r.notes,
    contact: r.contact,
    date: r.item_date,
    startTime: r.start_time ? r.start_time.slice(0, 5) : null,
    endTime: r.end_time ? r.end_time.slice(0, 5) : null,
    status: r.status,
    rescheduledToId: r.rescheduled_to_id,
    escalatedTo: r.escalated_to,
    escalatedToName: r.escalated_to_name,
    escalationNote: r.escalation_note,
    recursFreq: r.recurs_freq,
    recursInterval: r.recurs_interval,
    recursUntil: r.recurs_until,
    recursParentId: r.recurs_parent_id,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

const TODO_COLUMNS =
  "id,owner_key,owner_name,assigned_to,assigned_to_name,title,notes,contact,item_date,start_time,end_time,status,rescheduled_to_id,escalated_to,escalated_to_name,escalation_note,recurs_freq,recurs_interval,recurs_until,recurs_parent_id,created_at,completed_at";

async function fetchTodos(staffKey: string | undefined, fromDate: string, toDate: string): Promise<Todo[]> {
  if (!staffKey) return [];
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("op_todos")
    .select(TODO_COLUMNS)
    .eq("assigned_to", staffKey)
    .gte("item_date", fromDate)
    .lte("item_date", toDate)
    .order("item_date")
    .order("start_time");
  if (error) throw error;
  return (data as Raw[]).map(mapTodo);
}

export function useMySchedule(staffKey: string | undefined, fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ["myTodos", staffKey, fromDate, toDate],
    queryFn: () => fetchTodos(staffKey, fromDate, toDate),
    enabled: Boolean(staffKey),
    refetchInterval: 15_000,
  });
}

interface NewTodoInput {
  title: string;
  notes: string | null;
  contact: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
}

function expectedTodo(todo: Todo) {
  return {
    title: todo.title,
    notes: todo.notes,
    contact: todo.contact,
    date: todo.date,
    startTime: todo.startTime,
    endTime: todo.endTime,
    status: todo.status,
  };
}

async function todoAction<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc("operations_todo_action", {
    p_action: action,
    p_payload: payload,
  });
  if (error) throw error;
  return data as T;
}

async function insertTodo(_ownerKey: string, _ownerName: string, t: NewTodoInput): Promise<Todo> {
  const raw = await todoAction<Raw>("create", {
    title: t.title, notes: t.notes, contact: t.contact, date: t.date,
    startTime: t.startTime, endTime: t.endTime,
  });
  return mapTodo(raw);
}

export function useCreateTodo(ownerKey: string | undefined, ownerName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: NewTodoInput) => {
      if (!ownerKey || !ownerName) throw new Error("Your profile is not ready.");
      return insertTodo(ownerKey, ownerName, t);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

// Keep recurrence generation in sync with the displayed simple daily/weekly/monthly rule.
function generateRecurrenceDates(startDate: string, freq: RecurFreq, interval: number, until: string | null, cap: number): string[] {
  const dates = [startDate];
  let cur = startDate;
  while (dates.length < cap) {
    if (freq === "daily") {
      cur = addScheduleDays(cur, interval);
    } else if (freq === "weekly") {
      cur = addScheduleDays(cur, 7 * interval);
    } else {
      const [y, m, d] = cur.split("-").map(Number);
      const idx = m - 1 + interval;
      const ty = y + Math.floor(idx / 12);
      const tm = ((idx % 12) + 12) % 12;
      const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
      cur = `${ty}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
    }
    if (until && cur > until) break;
    dates.push(cur);
  }
  return dates;
}

export function useCreateRecurringTodo(ownerKey: string | undefined, ownerName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTodoInput & { recur: { freq: RecurFreq; interval: number; until: string | null } }) => {
      if (!ownerKey || !ownerName) throw new Error("Your profile is not ready.");
      const interval = input.recur.interval || 1;
      const dates = generateRecurrenceDates(input.date, input.recur.freq, interval, input.recur.until, 12);
      const rows = await todoAction<Raw[]>("create_series", {
        title: input.title, notes: input.notes, contact: input.contact, date: input.date,
        startTime: input.startTime, endTime: input.endTime, freq: input.recur.freq,
        interval, until: input.recur.until, dates,
      });
      return rows.map(mapTodo);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

export function useUpdateTodoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ todo, status }: { todo: Todo; status: TodoStatus }) => {
      await todoAction<Raw>("status", { id: todo.id, status, expectedStatus: todo.status });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

// Rescheduling is one atomic, auditable action; the original item remains as history.
export function useRescheduleTodo(_ownerKey: string | undefined, _ownerName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ todo, newDate, newStart, newEnd }: { todo: Todo; newDate: string; newStart: string | null; newEnd: string | null }) =>
      mapTodo(await todoAction<Raw>("reschedule", {
        id: todo.id, expected: expectedTodo(todo), date: newDate, startTime: newStart, endTime: newEnd,
      })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

export function useUpdateTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ todo, patch }: { todo: Todo; patch: Partial<NewTodoInput> }) => {
      const dbPatch: Record<string, unknown> = {};
      if (patch.title !== undefined) dbPatch.title = patch.title;
      if (patch.notes !== undefined) dbPatch.notes = patch.notes;
      if (patch.contact !== undefined) dbPatch.contact = patch.contact;
      if (patch.date !== undefined) dbPatch.date = patch.date;
      if (patch.startTime !== undefined) dbPatch.startTime = patch.startTime;
      if (patch.endTime !== undefined) dbPatch.endTime = patch.endTime;
      await todoAction<Raw>("update", { id: todo.id, expected: expectedTodo(todo), patch: dbPatch });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (todo: Todo) => todoAction<{ removed: boolean; item: Raw }>("delete", {
      id: todo.id, expectedStatus: todo.status,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

export function useCancelFutureRecurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ seriesId, fromDate }: { seriesId: string; fromDate: string }) =>
      todoAction<{ cancelled: number }>("cancel_future", { seriesId, fromDate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

// Real time-range conflict detection, same generalization V1's
// apiCheckScheduleConflicts makes of the Leave Schedules pattern (whole-
// date -> [start,end) time-range overlap), queried live rather than off
// whatever's already loaded in the current view window.
export async function checkScheduleConflicts(staffKey: string, date: string, start: string, end: string, excludeId?: string) {
  const sb = requireSupabase();
  const [todoResult, meetingResult] = await Promise.all([
    sb
      .from("op_todos")
      .select("id,title,start_time,end_time,status,item_date")
      .eq("item_date", date)
      .or(`assigned_to.eq.${staffKey},owner_key.eq.${staffKey}`)
      .not("status", "in", "(done,cancelled,rescheduled)"),
    sb
      .from("schedule_items")
      .select("id,title,start_time,end_time,status,item_date,owner_key,assigned_to")
      .eq("kind", "meeting")
      .eq("item_date", date)
      .not("status", "in", "(done,cancelled,rescheduled)"),
  ]);
  if (todoResult.error) throw todoResult.error;
  if (meetingResult.error) throw meetingResult.error;

  const meetingRows = meetingResult.data ?? [];
  const meetingIds = meetingRows.map((row) => row.id);
  const invitedMeetingIds = new Set<string>();
  if (meetingIds.length > 0) {
    const inviteeResult = await sb
      .from("schedule_item_invitees")
      .select("schedule_item_id")
      .eq("staff_key", staffKey)
      .in("schedule_item_id", meetingIds);
    if (inviteeResult.error) throw inviteeResult.error;
    for (const row of inviteeResult.data ?? []) {
      invitedMeetingIds.add(row.schedule_item_id);
    }
  }

  const taskItems = (todoResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    startTime: row.start_time?.slice(0, 5) ?? null,
    endTime: row.end_time?.slice(0, 5) ?? null,
    status: row.status,
    date: row.item_date,
    kind: "task" as const,
  }));
  const meetingItems = meetingRows
    .filter(
      (row) =>
        row.owner_key === staffKey ||
        row.assigned_to === staffKey ||
        invitedMeetingIds.has(row.id),
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      startTime: row.start_time?.slice(0, 5) ?? null,
      endTime: row.end_time?.slice(0, 5) ?? null,
      status: row.status,
      date: row.item_date,
      kind: "meeting" as const,
    }));

  return findScheduleConflicts([...taskItems, ...meetingItems], {
    date,
    startTime: start,
    endTime: end,
    excludeId,
  });
}

export function useEscalateTodo(_escalatedBy: string | undefined, _escalatedByName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, toKey, note }: { id: string; toKey: string; toName: string; note: string }) => {
      await todoAction<Raw>("escalate", { id, toKey, note });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

