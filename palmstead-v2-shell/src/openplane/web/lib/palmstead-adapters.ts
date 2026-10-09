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
import type { IProject, IState, IIssueLabel, IUser, IWorkspace, TBaseIssue, TIssuePriorities } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";
import { useAuthStore } from "@/stores/auth/auth-store";

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
