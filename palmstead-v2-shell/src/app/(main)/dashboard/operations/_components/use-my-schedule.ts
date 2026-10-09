"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isoDateOnly } from "@/lib/palmstead/format";
import { requireSupabase } from "@/lib/supabase.client";

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
  return useQuery({ queryKey: ["myTodos", staffKey, fromDate, toDate], queryFn: () => fetchTodos(staffKey, fromDate, toDate), enabled: Boolean(staffKey) });
}

interface NewTodoInput {
  title: string;
  notes: string | null;
  contact: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
}

async function insertTodo(ownerKey: string, ownerName: string, t: NewTodoInput): Promise<Todo> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("op_todos")
    .insert({
      owner_key: ownerKey,
      owner_name: ownerName,
      assigned_to: ownerKey,
      assigned_to_name: ownerName,
      assigned_by: ownerKey,
      assigned_by_name: ownerName,
      title: t.title,
      notes: t.notes,
      contact: t.contact,
      item_date: t.date,
      start_time: t.startTime,
      end_time: t.endTime,
    })
    .select(TODO_COLUMNS)
    .single();
  if (error) throw error;
  return mapTodo(data as Raw);
}

export function useCreateTodo(ownerKey: string | undefined, ownerName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: NewTodoInput) => insertTodo(ownerKey as string, ownerName as string, t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

// Real recurrence generator, same simplified rules as V1's
// generateRecurrenceDates: daily/weekly/monthly + interval, optional end
// date, capped at 12 occurrences, materialized as real rows up front
// (matching this codebase's existing simple-generation style, not a
// virtual RFC5545 expansion).
function generateRecurrenceDates(startDate: string, freq: RecurFreq, interval: number, until: string | null, cap: number): string[] {
  const dates = [startDate];
  let cur = startDate;
  while (dates.length < cap) {
    if (freq === "daily") {
      const d = new Date(cur);
      d.setDate(d.getDate() + interval);
      cur = isoDateOnly(d);
    } else if (freq === "weekly") {
      const d = new Date(cur);
      d.setDate(d.getDate() + 7 * interval);
      cur = isoDateOnly(d);
    } else {
      const [y, m, d] = cur.split("-").map(Number);
      const idx = m - 1 + interval;
      const ty = y + Math.floor(idx / 12);
      const tm = ((idx % 12) + 12) % 12;
      const lastDay = new Date(ty, tm + 1, 0).getDate();
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
      const sb = requireSupabase();
      const dates = generateRecurrenceDates(input.date, input.recur.freq, input.recur.interval || 1, input.recur.until, 12);
      const rows = dates.map((d) => ({
        owner_key: ownerKey,
        owner_name: ownerName,
        assigned_to: ownerKey,
        assigned_to_name: ownerName,
        assigned_by: ownerKey,
        assigned_by_name: ownerName,
        title: input.title,
        notes: input.notes,
        contact: input.contact,
        item_date: d,
        start_time: input.startTime,
        end_time: input.endTime,
        recurs_freq: input.recur.freq,
        recurs_interval: input.recur.interval || 1,
        recurs_until: input.recur.until,
      }));
      const { data, error } = await sb.from("op_todos").insert(rows).select(TODO_COLUMNS);
      if (error) throw error;
      const mapped = (data as Raw[]).map(mapTodo);
      if (mapped.length > 1) {
        const parentId = mapped[0].id;
        const childIds = mapped.slice(1).map((m) => m.id);
        await sb.from("op_todos").update({ recurs_parent_id: parentId }).in("id", childIds);
      }
      return mapped;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

export function useUpdateTodoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TodoStatus }) => {
      const sb = requireSupabase();
      const patch: Record<string, unknown> = { status };
      if (status === "done") patch.completed_at = new Date().toISOString();
      if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
      const { error } = await sb.from("op_todos").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

// Real drag-to-reschedule: inserts a NEW row at the new date/time and
// marks the original 'rescheduled' (auditable move), same as V1's real
// apiRescheduleTodo -- not an in-place date edit.
export function useRescheduleTodo(ownerKey: string | undefined, ownerName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ todo, newDate, newStart, newEnd }: { todo: Todo; newDate: string; newStart: string | null; newEnd: string | null }) => {
      const created = await insertTodo(ownerKey as string, ownerName as string, {
        title: todo.title,
        notes: todo.notes,
        contact: todo.contact,
        date: newDate,
        startTime: newStart,
        endTime: newEnd,
      });
      const sb = requireSupabase();
      const { error } = await sb.from("op_todos").update({ status: "rescheduled", rescheduled_to_id: created.id }).eq("id", todo.id);
      if (error) throw error;
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

export function useUpdateTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewTodoInput> }) => {
      const sb = requireSupabase();
      const dbPatch: Record<string, unknown> = {};
      if (patch.title !== undefined) dbPatch.title = patch.title;
      if (patch.notes !== undefined) dbPatch.notes = patch.notes;
      if (patch.contact !== undefined) dbPatch.contact = patch.contact;
      if (patch.date !== undefined) dbPatch.item_date = patch.date;
      if (patch.startTime !== undefined) dbPatch.start_time = patch.startTime;
      if (patch.endTime !== undefined) dbPatch.end_time = patch.endTime;
      const { error } = await sb.from("op_todos").update(dbPatch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("op_todos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

export function useCancelFutureRecurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ seriesId, fromDate }: { seriesId: string; fromDate: string }) => {
      const sb = requireSupabase();
      const { error } = await sb
        .from("op_todos")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .or(`recurs_parent_id.eq.${seriesId},id.eq.${seriesId}`)
        .eq("status", "open")
        .gte("item_date", fromDate);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}

// Real time-range conflict detection, same generalization V1's
// apiCheckScheduleConflicts makes of the Leave Schedules pattern (whole-
// date -> [start,end) time-range overlap), queried live rather than off
// whatever's already loaded in the current view window.
export async function checkScheduleConflicts(staffKey: string, date: string, start: string, end: string, excludeId?: string) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("op_todos")
    .select("id,title,start_time,end_time,status")
    .eq("item_date", date)
    .or(`assigned_to.eq.${staffKey},owner_key.eq.${staffKey}`)
    .not("status", "in", "(done,cancelled,rescheduled)")
    .not("start_time", "is", null);
  if (error) return [];
  return (data ?? [])
    .filter((r) => r.id !== excludeId && start < (r.end_time ?? "").slice(0, 5) && (r.start_time ?? "").slice(0, 5) < end)
    .map((r) => ({ id: r.id, title: r.title, startTime: (r.start_time ?? "").slice(0, 5), endTime: (r.end_time ?? "").slice(0, 5) }));
}

export function useEscalateTodo(escalatedBy: string | undefined, escalatedByName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, toKey, toName, note }: { id: string; toKey: string; toName: string; note: string }) => {
      const sb = requireSupabase();
      const { error } = await sb
        .from("op_todos")
        .update({
          assigned_to: toKey,
          assigned_to_name: toName,
          escalated_to: toKey,
          escalated_to_name: toName,
          escalated_by: escalatedBy,
          escalated_by_name: escalatedByName,
          escalated_at: new Date().toISOString(),
          escalation_note: note,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["myTodos"] }),
  });
}
