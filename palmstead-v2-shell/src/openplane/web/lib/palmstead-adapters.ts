/**
 * Phase 4b adapters -- translate between Palmstead's real op_* rows (and the
 * real `profiles` table) and plane's own TS types (@plane/types), which the
 * raw-duplicated store/UI layer expects unedited. This is the "twist to fit"
 * seam: plane's types carry SaaS-only fields (owner, role, total_members,
 * url, ...) that don't exist in Palmstead's single-company schema -- those
 * get sensible, explicitly-flagged fill values here, never fabricated as if
 * they were read from a real table.
 *
 * Not a general user-service rewrite: getCurrentStaffUser() exists only to
 * satisfy IWorkspace.owner / IProject.project_lead etc.'s shape, scoped to
 * what this adapter needs.
 */
import type {
  IProject,
  IState,
  IIssueLabel,
  IUser,
  IWorkspace,
  TBaseIssue,
  TIssuePriorities,
  TIssueComment,
  TIssueActivity,
  ICycle,
  IModule,
} from "@plane/types";
import { EUserWorkspaceRoles, EInboxIssueSource, EIssueCommentAccessSpecifier } from "@plane/types";
import { useAuthStore } from "@/stores/auth/auth-store";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileRow = {
  agent_key: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
};

/** The signed-in staff member, read straight from the real auth store (no network call). */
export function currentStaffKey(): string | null {
  return useAuthStore.getState().profile?.key ?? null;
}

/** Minimal IUser built from a real `profiles` row -- only the fields plane's UI actually reads. */
export function toPlaneUser(row: ProfileRow): IUser {
  const [first, ...rest] = row.name.split(" ");
  return {
    id: row.agent_key,
    avatar_url: "",
    display_name: row.name,
    first_name: first ?? row.name,
    last_name: rest.join(" "),
    email: row.email ?? "",
    is_bot: false,
    cover_image_url: null,
    date_joined: "",
    is_active: row.active,
    is_email_verified: true,
    is_password_autoset: false,
    is_tour_completed: true,
    mobile_number: null,
    last_workspace_id: "",
    user_timezone: "Africa/Accra",
    username: row.agent_key,
    last_login_medium: "email",
    theme: { theme: "system" } as IUser["theme"],
  };
}

export type OpWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  organization_size: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export function toPlaneWorkspace(row: OpWorkspaceRow, owner: IUser, totalMembers: number): IWorkspace {
  return {
    id: row.id,
    owner,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    name: row.name,
    url: `/${row.slug}`,
    logo_url: row.logo_url,
    total_members: totalMembers,
    slug: row.slug,
    created_by: owner.id,
    updated_by: owner.id,
    organization_size: row.organization_size ?? "",
    // Single-company deployment -- every signed-in staff member has
    // workspace-admin standing; real per-app access control lives in each
    // app's own role checks (project_members.role, RLS), not here.
    role: EUserWorkspaceRoles.ADMIN,
    timezone: row.timezone,
  };
}

export type OpProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  identifier: string;
  description: string | null;
  logo_props: unknown;
  cover_image: string | null;
  network: number;
  project_lead_key: string | null;
  default_assignee_key: string | null;
  default_state_id: string | null;
  cycle_view: boolean;
  module_view: boolean;
  issue_views_view: boolean;
  page_view: boolean;
  inbox_view: boolean;
  archived_at: string | null;
  next_work_item_sequence: number;
  sort_order: number | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export function toPlaneProject(row: OpProjectRow): IProject {
  return {
    id: row.id,
    name: row.name,
    identifier: row.identifier,
    sort_order: row.sort_order,
    logo_props: (row.logo_props as IProject["logo_props"]) ?? { emoji: { value: "📁" } },
    member_role: null,
    archived_at: row.archived_at,
    workspace: row.workspace_id,
    cycle_view: row.cycle_view,
    issue_views_view: row.issue_views_view,
    module_view: row.module_view,
    page_view: row.page_view,
    inbox_view: row.inbox_view,
    project_lead: row.project_lead_key,
    network: row.network,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    created_by: row.created_by ?? undefined,
    updated_by: row.updated_by ?? undefined,
    cover_image: row.cover_image ?? undefined,
    default_assignee: row.default_assignee_key,
    default_state: row.default_state_id,
    description: row.description ?? undefined,
    is_favorite: false,
    next_work_item_sequence: row.next_work_item_sequence,
  };
}

export type OpStateRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  color: string;
  description: string | null;
  group: string;
  default: boolean;
  sequence: number;
  order: number;
};

export function toPlaneState(row: OpStateRow): IState {
  return {
    id: row.id,
    color: row.color,
    default: row.default,
    description: row.description ?? "",
    group: row.group as IState["group"],
    name: row.name,
    project_id: row.project_id,
    sequence: row.sequence,
    workspace_id: row.workspace_id,
    order: row.order,
  };
}

export type OpLabelRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  color: string;
  parent_id: string | null;
  sort_order: number;
};

export function toPlaneLabel(row: OpLabelRow): IIssueLabel {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    project_id: row.project_id,
    workspace_id: row.workspace_id,
    parent: row.parent_id,
    sort_order: row.sort_order,
  };
}

export type OpIssueRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  sequence_id: number;
  name: string;
  description_html: string | null;
  state_id: string | null;
  priority: string;
  parent_id: string | null;
  cycle_id: string | null;
  sort_order: number;
  start_date: string | null;
  target_date: string | null;
  completed_at: string | null;
  archived_at: string | null;
  is_draft: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Real assignee/label/module ids and sub-issue/attachment/link counts come
 * from separate join-table queries (op_issue_assignees/op_issue_labels/
 * op_issue_modules) -- passed in rather than queried per-row here, so a list
 * of issues costs a handful of batched queries, not N+1. attachment_count/
 * link_count stay 0 for now (Phase 6's first issues slice doesn't build
 * attachments/links yet) -- documented as not-yet-computed, not fabricated.
 */
export function toPlaneIssue(
  row: OpIssueRow,
  assigneeIds: string[],
  labelIds: string[],
  moduleIds: string[],
  subIssuesCount: number
): TBaseIssue {
  return {
    id: row.id,
    sequence_id: row.sequence_id,
    name: row.name,
    sort_order: row.sort_order,
    state_id: row.state_id,
    priority: row.priority as TIssuePriorities,
    label_ids: labelIds,
    assignee_ids: assigneeIds,
    estimate_point: null,
    sub_issues_count: subIssuesCount,
    attachment_count: 0,
    link_count: 0,
    project_id: row.project_id,
    parent_id: row.parent_id,
    cycle_id: row.cycle_id,
    module_ids: moduleIds,
    type_id: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    start_date: row.start_date,
    target_date: row.target_date,
    completed_at: row.completed_at,
    archived_at: row.archived_at,
    created_by: row.created_by ?? "",
    updated_by: row.updated_by ?? "",
    is_draft: row.is_draft,
  };
}

/**
 * Real values for the nested "_detail" objects plane's own activity/comment
 * types carry (so the UI can render an actor's name or a project's
 * identifier without a separate lookup) -- built from the real workspace/
 * project/issue rows and profiles already fetched once per request by the
 * caller, not fabricated placeholders.
 */
export type ActivityContext = {
  workspace: { id: string; name: string; slug: string };
  project: { id: string; identifier: string; name: string };
  issue: { id: string; sequence_id: number; name: string; description_html: string | null; priority: string; start_date: string | null; target_date: string | null; is_draft: boolean };
  profilesByKey: Map<string, ProfileRow>;
};

/**
 * Builds the shared ActivityContext (workspace/project/issue + the distinct
 * actor profiles for a batch of comments/activity rows) in a fixed, small
 * number of queries, so a page of comments/activity costs a handful of
 * round trips, not N+1.
 */
export async function buildActivityContext(
  sb: SupabaseClient,
  projectId: string,
  issueId: string,
  actorKeys: (string | null)[]
): Promise<ActivityContext> {
  const [{ data: issue, error: issueError }, { data: project, error: projectError }] = await Promise.all([
    sb.from("op_issues").select("id,sequence_id,name,description_html,priority,start_date,target_date,is_draft,workspace_id").eq("id", issueId).single(),
    sb.from("op_projects").select("id,identifier,name,workspace_id").eq("id", projectId).single(),
  ]);
  if (issueError || !issue) throw issueError ?? new Error("Issue not found");
  if (projectError || !project) throw projectError ?? new Error("Project not found");
  const { data: workspace, error: workspaceError } = await sb
    .from("op_workspaces")
    .select("id,name,slug")
    .eq("id", project.workspace_id)
    .single();
  if (workspaceError || !workspace) throw workspaceError ?? new Error("Workspace not found");
  const distinctKeys = Array.from(new Set(actorKeys.filter((k): k is string => !!k)));
  const profilesByKey = new Map<string, ProfileRow>();
  if (distinctKeys.length) {
    const { data: profiles } = await sb.from("profiles").select("agent_key,name,email,role,active").in("agent_key", distinctKeys);
    (profiles ?? []).forEach((p) => profilesByKey.set(p.agent_key, p as ProfileRow));
  }
  return { workspace, project, issue, profilesByKey };
}

function actorDetail(ctx: ActivityContext, actorKey: string | null) {
  const profile = actorKey ? ctx.profilesByKey.get(actorKey) : undefined;
  const name = profile?.name ?? actorKey ?? "Unknown";
  const [first, ...rest] = name.split(" ");
  return {
    id: actorKey ?? "",
    first_name: first ?? name,
    last_name: rest.join(" "),
    avatar_url: "",
    is_bot: false,
    display_name: name,
  };
}

function workspaceDetail(ctx: ActivityContext) {
  return { id: ctx.workspace.id, name: ctx.workspace.name, slug: ctx.workspace.slug };
}

function projectDetail(ctx: ActivityContext) {
  return {
    id: ctx.project.id,
    identifier: ctx.project.identifier,
    name: ctx.project.name,
    cover_image: "",
    description: null,
    emoji: null,
    icon_prop: null,
  };
}

function issueDetail(ctx: ActivityContext) {
  return {
    id: ctx.issue.id,
    sequence_id: ctx.issue.sequence_id,
    sort_order: false,
    name: ctx.issue.name,
    description_html: ctx.issue.description_html ?? "",
    priority: ctx.issue.priority as TIssuePriorities,
    start_date: ctx.issue.start_date ?? "",
    target_date: ctx.issue.target_date ?? "",
    is_draft: ctx.issue.is_draft,
  };
}

export type OpIssueCommentRow = {
  id: string;
  issue_id: string;
  comment_html: string;
  actor_key: string | null;
  created_at: string;
  updated_at: string;
};

export function toPlaneComment(row: OpIssueCommentRow, ctx: ActivityContext): TIssueComment {
  return {
    id: row.id,
    workspace: ctx.workspace.id,
    workspace_detail: workspaceDetail(ctx),
    project: ctx.project.id,
    project_detail: projectDetail(ctx),
    issue: row.issue_id,
    issue_detail: issueDetail(ctx),
    actor: row.actor_key ?? "",
    actor_detail: actorDetail(ctx, row.actor_key),
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.actor_key ?? undefined,
    updated_by: row.actor_key ?? undefined,
    attachments: [],
    comment_reactions: [],
    comment_stripped: row.comment_html.replace(/<[^>]*>/g, ""),
    comment_html: row.comment_html,
    comment_json: {},
    external_id: undefined,
    external_source: undefined,
    access: EIssueCommentAccessSpecifier.INTERNAL,
  };
}

export type OpIssueActivityRow = {
  id: string;
  issue_id: string;
  actor_key: string | null;
  verb: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  created_at: string;
};

export function toPlaneActivity(row: OpIssueActivityRow, ctx: ActivityContext): TIssueActivity {
  return {
    id: row.id,
    workspace: ctx.workspace.id,
    workspace_detail: workspaceDetail(ctx),
    project: ctx.project.id,
    project_detail: projectDetail(ctx),
    issue: row.issue_id,
    issue_detail: issueDetail(ctx),
    actor: row.actor_key ?? "",
    actor_detail: actorDetail(ctx, row.actor_key),
    created_at: row.created_at,
    updated_at: row.created_at,
    created_by: row.actor_key ?? undefined,
    updated_by: row.actor_key ?? undefined,
    attachments: [],
    verb: row.verb,
    field: row.field ?? undefined,
    old_value: row.old_value ?? undefined,
    new_value: row.new_value ?? undefined,
    comment: row.comment ?? undefined,
    old_identifier: undefined,
    new_identifier: undefined,
    epoch: new Date(row.created_at).getTime(),
    issue_comment: null,
    source_data: { source: EInboxIssueSource.IN_APP, extra: {} },
  };
}

/**
 * Real gap found live: plane's own store code (e.g.
 * issue-details/subscription.store.ts's `currentUserId` check) reads
 * `rootStore.user.data.id` and throws "user id not available" when it's
 * unset -- this phase never rewired the full user.service.ts pipeline
 * (`fetchCurrentUser`, a bigger Phase 6 slice of its own), so this sets the
 * minimal real IUser directly from the signed-in staff's own profiles row
 * once per session, without touching plane's user service/store logic.
 */
export async function ensureCurrentPlaneUser(sb: SupabaseClient, rootStoreUser: { data: IUser | undefined }): Promise<void> {
  if (rootStoreUser.data) return;
  const staffKey = currentStaffKey();
  if (!staffKey) return;
  const { data } = await sb.from("profiles").select("agent_key,name,email,role,active").eq("agent_key", staffKey).single();
  if (data) rootStoreUser.data = toPlaneUser(data as ProfileRow);
}

export type OpCycleRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  owned_by_key: string | null;
  sort_order: number;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Real per-cycle issue counts by state group, grouped in one query for a page of cycles, not N+1. */
export type CycleProgressCounts = Record<
  string,
  { total_issues: number; completed_issues: number; backlog_issues: number; started_issues: number; unstarted_issues: number; cancelled_issues: number }
>;

function deriveCycleStatus(row: OpCycleRow): "draft" | "upcoming" | "completed" | "current" {
  if (!row.start_date && !row.end_date) return "draft";
  const today = new Date().toISOString().slice(0, 10);
  if (row.start_date && today < row.start_date) return "upcoming";
  if (row.end_date && today > row.end_date) return "completed";
  return "current";
}

export function toPlaneCycle(row: OpCycleRow, counts: CycleProgressCounts[string] | undefined): ICycle {
  const c = counts ?? { total_issues: 0, completed_issues: 0, backlog_issues: 0, started_issues: 0, unstarted_issues: 0, cancelled_issues: 0 };
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    name: row.name,
    description: row.description ?? "",
    start_date: row.start_date,
    end_date: row.end_date,
    owned_by_id: row.owned_by_key ?? "",
    sort_order: row.sort_order,
    archived_at: row.archived_at,
    created_at: row.created_at,
    created_by: row.created_by ?? undefined,
    updated_at: row.updated_at,
    is_favorite: false,
    status: deriveCycleStatus(row),
    view_props: { filters: {} },
    project_detail: { id: row.project_id },
    progress: [],
    version: 0,
    progress_snapshot: undefined,
    total_issues: c.total_issues,
    completed_issues: c.completed_issues,
    backlog_issues: c.backlog_issues,
    started_issues: c.started_issues,
    unstarted_issues: c.unstarted_issues,
    cancelled_issues: c.cancelled_issues,
    backlog_estimate_points: 0,
    started_estimate_points: 0,
    unstarted_estimate_points: 0,
    cancelled_estimate_points: 0,
  };
}

export type OpModuleRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  description: string | null;
  description_html: string | null;
  lead_key: string | null;
  status: string;
  start_date: string | null;
  target_date: string | null;
  sort_order: number;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Real per-module issue counts by state group -- same shape as CycleProgressCounts, keyed by module id. */
export type ModuleProgressCounts = CycleProgressCounts;

export function toPlaneModule(row: OpModuleRow, memberIds: string[], counts: ModuleProgressCounts[string] | undefined): IModule {
  const c = counts ?? { total_issues: 0, completed_issues: 0, backlog_issues: 0, started_issues: 0, unstarted_issues: 0, cancelled_issues: 0 };
  return {
    total_issues: c.total_issues,
    completed_issues: c.completed_issues,
    backlog_issues: c.backlog_issues,
    started_issues: c.started_issues,
    unstarted_issues: c.unstarted_issues,
    cancelled_issues: c.cancelled_issues,
    backlog_estimate_points: 0,
    started_estimate_points: 0,
    unstarted_estimate_points: 0,
    cancelled_estimate_points: 0,
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    description_text: undefined,
    description_html: row.description_html ?? "",
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    lead_id: row.lead_key,
    member_ids: memberIds,
    is_favorite: false,
    sort_order: row.sort_order,
    view_props: { filters: {} },
    status: row.status as IModule["status"],
    archived_at: row.archived_at,
    start_date: row.start_date,
    target_date: row.target_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by ?? undefined,
  };
}
