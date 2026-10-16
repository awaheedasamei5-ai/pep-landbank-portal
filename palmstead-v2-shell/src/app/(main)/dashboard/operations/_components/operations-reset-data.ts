import { z } from "zod";

import { requireSupabase } from "@/lib/supabase.client";

export const resetScopes = [
  {
    key: "projects",
    title: "Projects and work items",
    description: "Projects, tasks, sub-tasks, comments, activity, members, cycles, modules and saved views.",
  },
  {
    key: "todos",
    title: "Personal and delegated to-dos",
    description: "All staff to-dos, including recurring items and reschedule chains.",
  },
  {
    key: "meetings",
    title: "Meetings and invitations",
    description: "Meetings, RSVP responses, attachment records and related events. Other schedule tasks stay.",
  },
] as const;
export type ResetScope = (typeof resetScopes)[number]["key"];

const batchSchema = z.object({
  id: z.string().uuid(),
  app_key: z.literal("operations"),
  scopes: z.array(z.enum(["projects", "todos", "meetings"])),
  actor_name: z.string(),
  reason: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
  status: z.enum(["preview", "executed", "restored"]),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  executed_at: z.string().nullable(),
  restored_at: z.string().nullable(),
  events: z.array(z.object({ action: z.string(), actor_name: z.string(), created_at: z.string() })),
});
export type ResetBatch = z.infer<typeof batchSchema>;
const previewSchema = z.object({ blockers: z.array(z.string()), batch: batchSchema.nullable() });
const historySchema = z.object({ batches: z.array(batchSchema), has_more: z.boolean() });

async function call(name: string, parameters: Record<string, unknown>) {
  const { data, error } = await requireSupabase().rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data;
}

export async function previewOperationsReset(scopes: ResetScope[], reason: string) {
  return previewSchema.parse(await call("preview_operations_reset", { p_scopes: scopes, p_reason: reason }));
}
export async function executeOperationsReset(id: string, confirmation: string) {
  return batchSchema.parse(await call("execute_operations_reset", { p_batch_id: id, p_confirmation: confirmation }));
}
export async function restoreOperationsReset(id: string, confirmation: string) {
  return batchSchema.parse(await call("restore_operations_reset", { p_batch_id: id, p_confirmation: confirmation }));
}
export async function listOperationsResets(before: string | null) {
  return historySchema.parse(await call("list_operations_resets", { p_before: before }));
}

export const impactLabels: Record<string, string> = {
  op_projects: "Projects",
  op_states: "Workflow states",
  op_labels: "Labels",
  op_cycles: "Cycles",
  op_modules: "Modules",
  op_project_members: "Project memberships",
  op_module_members: "Module memberships",
  op_issues: "Work items and sub-items",
  op_issue_assignees: "Work-item assignments",
  op_issue_labels: "Work-item label links",
  op_issue_modules: "Work-item module links",
  op_issue_relations: "Dependencies and relations",
  op_issue_links: "External links",
  op_issue_attachments: "Work-item attachment records",
  op_issue_comments: "Comments",
  op_issue_activity: "Activity entries",
  op_views: "Saved views",
  op_todos: "To-dos",
  schedule_items: "Meetings",
  schedule_item_invitees: "Meeting invitations",
  schedule_item_attachments: "Meeting attachment records",
  task_events: "Meeting events",
};

export function totalResetRecords(batch: ResetBatch) {
  return Object.values(batch.counts).reduce((sum, count) => sum + count, 0);
}

export function resetDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value));
}
