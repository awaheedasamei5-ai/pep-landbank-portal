/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import { EIssueServiceType } from "@plane/types";
import type {
  TIssueParams,
  IIssueDisplayProperties,
  TBulkOperationsPayload,
  TIssue,
  TIssueActivity,
  TIssueLink,
  TIssueServiceType,
  TIssuesResponse,
  TIssueSubIssues,
} from "@plane/types";
// services
import { APIService } from "@openplane-web/services/api.service";
import { requireSupabase } from "@/lib/supabase.client";
import { currentStaffKey, toPlaneIssue, type OpIssueRow } from "@openplane-web/lib/palmstead-adapters";

/**
 * Batches the real op_issue_assignees/op_issue_labels/op_issue_modules joins
 * for a whole page of issues in 3 queries total, not one per issue, then
 * maps each row through toPlaneIssue. sub_issues_count is a real grouped
 * count of op_issues.parent_id against this same id list.
 */
async function hydrateIssues(rows: OpIssueRow[]): Promise<TIssue[]> {
  if (rows.length === 0) return [];
  const sb = requireSupabase();
  const ids = rows.map((r) => r.id);
  const [{ data: assignees }, { data: labels }, { data: modules }, { data: children }] = await Promise.all([
    sb.from("op_issue_assignees").select("issue_id,assignee_key").in("issue_id", ids),
    sb.from("op_issue_labels").select("issue_id,label_id").in("issue_id", ids),
    sb.from("op_issue_modules").select("issue_id,module_id").in("issue_id", ids),
    sb.from("op_issues").select("parent_id").in("parent_id", ids),
  ]);
  const byIssue = <T extends { issue_id: string }>(list: T[] | null, pick: (row: T) => string) => {
    const map = new Map<string, string[]>();
    (list ?? []).forEach((row) => {
      const arr = map.get(row.issue_id) ?? [];
      arr.push(pick(row));
      map.set(row.issue_id, arr);
    });
    return map;
  };
  const assigneeMap = byIssue(assignees, (r) => r.assignee_key);
  const labelMap = byIssue(labels, (r) => r.label_id);
  const moduleMap = byIssue(modules, (r) => r.module_id);
  const childCountMap = new Map<string, number>();
  (children ?? []).forEach((row) => {
    if (!row.parent_id) return;
    childCountMap.set(row.parent_id, (childCountMap.get(row.parent_id) ?? 0) + 1);
  });
  return rows.map(
    (row) =>
      toPlaneIssue(
        row,
        assigneeMap.get(row.id) ?? [],
        labelMap.get(row.id) ?? [],
        moduleMap.get(row.id) ?? [],
        childCountMap.get(row.id) ?? 0
      ) as TIssue
  );
}

export class IssueService extends APIService {
  private serviceType: TIssueServiceType;

  constructor(serviceType: TIssueServiceType = EIssueServiceType.ISSUES) {
    super(API_BASE_URL);
    this.serviceType = serviceType;
  }

  /**
   * Phase 6: real insert into op_issues (+ op_issue_assignees/op_issue_labels
   * join rows when the caller provides them). sequence_id/
   * next_work_item_sequence mirror plane's own backend behaviour: an
   * atomic read-then-increment on the parent project row, since Postgres
   * has no per-project auto-increment the way a single global sequence
   * would give us "OPS-1, OPS-2, ...".
   */
  async createIssue(_workspaceSlug: string, projectId: string, data: Partial<TIssue>): Promise<TIssue> {
    const sb = requireSupabase();
    const staffKey = currentStaffKey();
    // Real race found live: a plain read-then-write of
    // next_work_item_sequence let two concurrent creates claim the same
    // sequence_id and trip the (project_id, sequence_id) unique constraint.
    // op_claim_issue_sequence() does the claim+increment as one atomic
    // UPDATE ... RETURNING, so concurrent inserts always get distinct
    // numbers (migration op_issues_atomic_sequence_claim).
    const { data: claimed, error: claimError } = await sb
      .rpc("op_claim_issue_sequence", { p_project_id: projectId })
      .single<{ claimed_sequence: number; workspace_id: string; default_state_id: string | null }>();
    if (claimError || !claimed) throw claimError ?? new Error("Project not found");
    const { data: row, error } = await sb
      .from("op_issues")
      .insert({
        workspace_id: claimed.workspace_id,
        project_id: projectId,
        sequence_id: claimed.claimed_sequence,
        name: data.name,
        description_html: data.description_html ?? null,
        state_id: data.state_id ?? claimed.default_state_id ?? null,
        priority: data.priority ?? "none",
        parent_id: data.parent_id ?? null,
        cycle_id: data.cycle_id ?? null,
        start_date: data.start_date ?? null,
        target_date: data.target_date ?? null,
        is_draft: data.is_draft ?? false,
        created_by: staffKey,
        updated_by: staffKey,
      })
      .select("*")
      .single();
    if (error) throw error;
    if (data.assignee_ids?.length) {
      await sb
        .from("op_issue_assignees")
        .insert(data.assignee_ids.map((assigneeKey) => ({ issue_id: row.id, assignee_key: assigneeKey })));
    }
    if (data.label_ids?.length) {
      await sb.from("op_issue_labels").insert(data.label_ids.map((labelId) => ({ issue_id: row.id, label_id: labelId })));
    }
    await sb.from("op_issue_activity").insert({ issue_id: row.id, actor_key: staffKey, verb: "created", field: null });
    const [hydrated] = await hydrateIssues([row as OpIssueRow]);
    return hydrated;
  }

  /**
   * Phase 6 simplification: real read of every non-archived op_issues row
   * for the project, returned UNGROUPED (grouped_by: "") regardless of the
   * group_by/order_by/cursor params the caller builds for plane's own
   * Django pagination -- Palmstead's issue counts don't need server-side
   * pagination yet, and grouping/kanban views are a later Phase 6 slice,
   * not this one. Not silently wrong: every real issue for the project IS
   * returned, just not grouped or paged the way plane's backend would.
   */
  async getIssuesFromServer(
    _workspaceSlug: string,
    projectId: string,
    queries?: Partial<Record<string, string | boolean>>,
    _config = {}
  ): Promise<TIssuesResponse> {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("op_issues")
      .select("*")
      .eq("project_id", projectId)
      .is("archived_at", null)
      .order("sort_order");
    if (error) throw error;
    const issues = await hydrateIssues((data ?? []) as OpIssueRow[]);

    // Phase 6 kanban slice: only "state" grouping is real so far (priority/
    // labels/assignees/cycle/module grouping are later refinements) --
    // group_by is a literal pass-through of IssuePaginationOptions.groupedBy
    // (see issue-filter-helper.store.ts's getPaginationParams), so this
    // reads the exact value the kanban screen asked for.
    if (queries?.group_by === "state") {
      const grouped: Record<string, { results: TIssue[]; total_results: number }> = {};
      for (const issue of issues) {
        const key = issue.state_id ?? "none";
        if (!grouped[key]) grouped[key] = { results: [], total_results: 0 };
        grouped[key].results.push(issue);
        grouped[key].total_results += 1;
      }
      return {
        grouped_by: "state",
        next_cursor: "",
        prev_cursor: "",
        next_page_results: false,
        prev_page_results: false,
        total_count: issues.length,
        count: issues.length,
        total_pages: 1,
        extra_stats: null,
        results: grouped,
        total_results: issues.length,
      };
    }

    return {
      grouped_by: "",
      next_cursor: "",
      prev_cursor: "",
      next_page_results: false,
      prev_page_results: false,
      total_count: issues.length,
      count: issues.length,
      total_pages: 1,
      extra_stats: null,
      results: issues,
      total_results: issues.length,
    };
  }

  async getIssuesForSync(
    workspaceSlug: string,
    projectId: string,
    queries?: any,
    config = {}
  ): Promise<TIssuesResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/v2/${this.serviceType}/`,
      { params: queries },
      config
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssues(
    workspaceSlug: string,
    projectId: string,
    queries?: Partial<Record<TIssueParams, string | boolean>>,
    config = {}
  ): Promise<TIssuesResponse> {
    return this.getIssuesFromServer(workspaceSlug, projectId, queries, config);
  }

  async getDeletedIssues(workspaceSlug: string, projectId: string, queries?: any): Promise<TIssuesResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/deleted-issues/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssuesWithParams(
    workspaceSlug: string,
    projectId: string,
    queries?: any
  ): Promise<TIssue[] | { [key: string]: TIssue[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Phase 6: real read from op_issues. */
  async retrieve(_workspaceSlug: string, _projectId: string, issueId: string, _queries?: any): Promise<TIssue> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_issues").select("*").eq("id", issueId).single();
    if (error) throw error;
    const [hydrated] = await hydrateIssues([data as OpIssueRow]);
    return hydrated;
  }

  async retrieveIssues(workspaceSlug: string, projectId: string, issueIds: string[]): Promise<TIssue[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/list/`, {
      params: { issues: issueIds.join(",") },
    })
      .then(async (response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssueActivities(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueActivity[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/history/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addIssueToCycle(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    data: {
      issues: string[];
    }
  ) {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-issues/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeIssueFromCycle(workspaceSlug: string, projectId: string, cycleId: string, bridgeId: string) {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-issues/${bridgeId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createIssueRelation(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: {
      related_list: Array<{
        relation_type: "duplicate" | "relates_to" | "blocked_by";
        related_issue: string;
      }>;
      relation?: "blocking" | null;
    }
  ) {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/issue-relation/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async deleteIssueRelation(workspaceSlug: string, projectId: string, issueId: string, relationId: string) {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/issue-relation/${relationId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async getIssueDisplayProperties(workspaceSlug: string, projectId: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-display-properties/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueDisplayProperties(
    workspaceSlug: string,
    projectId: string,
    data: IIssueDisplayProperties
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-display-properties/`, {
      properties: data,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Phase 6: real update of op_issues (+ reconciling the assignee/label join tables when provided). */
  async patchIssue(_workspaceSlug: string, _projectId: string, issueId: string, data: Partial<TIssue>): Promise<TIssue> {
    const sb = requireSupabase();
    const staffKey = currentStaffKey();
    const { data: before } = await sb.from("op_issues").select("state_id,priority,name,target_date").eq("id", issueId).single();
    const patch: Record<string, unknown> = { updated_by: staffKey };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description_html !== undefined) patch.description_html = data.description_html;
    if (data.state_id !== undefined) patch.state_id = data.state_id;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.parent_id !== undefined) patch.parent_id = data.parent_id;
    if (data.cycle_id !== undefined) patch.cycle_id = data.cycle_id;
    if (data.start_date !== undefined) patch.start_date = data.start_date;
    if (data.target_date !== undefined) patch.target_date = data.target_date;
    if (data.completed_at !== undefined) patch.completed_at = data.completed_at;
    if (data.is_draft !== undefined) patch.is_draft = data.is_draft;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    const { data: row, error } = await sb.from("op_issues").update(patch).eq("id", issueId).select("*").single();
    if (error) throw error;
    if (data.assignee_ids !== undefined) {
      await sb.from("op_issue_assignees").delete().eq("issue_id", issueId);
      if (data.assignee_ids.length) {
        await sb
          .from("op_issue_assignees")
          .insert(data.assignee_ids.map((assigneeKey) => ({ issue_id: issueId, assignee_key: assigneeKey })));
      }
    }
    if (data.label_ids !== undefined) {
      await sb.from("op_issue_labels").delete().eq("issue_id", issueId);
      if (data.label_ids.length) {
        await sb.from("op_issue_labels").insert(data.label_ids.map((labelId) => ({ issue_id: issueId, label_id: labelId })));
      }
    }
    if (data.module_ids !== undefined && data.module_ids !== null) {
      await sb.from("op_issue_modules").delete().eq("issue_id", issueId);
      if (data.module_ids.length) {
        await sb.from("op_issue_modules").insert(data.module_ids.map((moduleId) => ({ issue_id: issueId, module_id: moduleId })));
      }
    }

    // Real audit trail: one op_issue_activity row per field that actually
    // changed, old_value -> new_value -- this is the escalation/history
    // record the Operations Tracker needs, not a cosmetic log.
    if (before) {
      const diffs: { field: string; old_value: string | null; new_value: string | null }[] = [];
      if (data.state_id !== undefined && data.state_id !== before.state_id) {
        diffs.push({ field: "state", old_value: before.state_id, new_value: data.state_id });
      }
      if (data.priority !== undefined && data.priority !== before.priority) {
        diffs.push({ field: "priority", old_value: before.priority, new_value: data.priority });
      }
      if (data.name !== undefined && data.name !== before.name) {
        diffs.push({ field: "name", old_value: before.name, new_value: data.name });
      }
      if (data.target_date !== undefined && data.target_date !== before.target_date) {
        diffs.push({ field: "target_date", old_value: before.target_date, new_value: data.target_date });
      }
      if (diffs.length) {
        await sb
          .from("op_issue_activity")
          .insert(diffs.map((d) => ({ issue_id: issueId, actor_key: staffKey, verb: "updated", ...d })));
      }
    }

    const [hydrated] = await hydrateIssues([row as OpIssueRow]);
    return hydrated;
  }

  /** Phase 6: real delete from op_issues (join rows cascade via the real FKs). */
  async deleteIssue(_workspaceSlug: string, _projectId: string, issuesId: string): Promise<{ success: true }> {
    const sb = requireSupabase();
    const { error } = await sb.from("op_issues").delete().eq("id", issuesId);
    if (error) throw error;
    return { success: true };
  }

  async updateIssueDates(
    workspaceSlug: string,
    projectId: string,
    updates: { id: string; start_date?: string; target_date?: string }[]
  ): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-dates/`, { updates })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async subIssues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    queries?: Partial<Record<TIssueParams, string | boolean>>
  ): Promise<TIssueSubIssues> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/${this.serviceType === EIssueServiceType.EPICS ? "issues" : "sub-issues"}/`,
      { params: queries }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addSubIssues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { sub_issue_ids: string[] }
  ): Promise<TIssueSubIssues> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/${this.serviceType === EIssueServiceType.EPICS ? "issues" : "sub-issues"}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchIssueLinks(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueLink[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/${this.serviceType === EIssueServiceType.EPICS ? "links" : "issue-links"}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async createIssueLink(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueLink>
  ): Promise<TIssueLink> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/${this.serviceType === EIssueServiceType.EPICS ? "links" : "issue-links"}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async updateIssueLink(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    linkId: string,
    data: Partial<TIssueLink>
  ): Promise<TIssueLink> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/${this.serviceType === EIssueServiceType.EPICS ? "links" : "issue-links"}/${linkId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async deleteIssueLink(workspaceSlug: string, projectId: string, issueId: string, linkId: string): Promise<any> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/${this.serviceType === EIssueServiceType.EPICS ? "links" : "issue-links"}/${linkId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkOperations(workspaceSlug: string, projectId: string, data: TBulkOperationsPayload): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bulk-operation-issues/`, data)
      .then(async (response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkDeleteIssues(
    workspaceSlug: string,
    projectId: string,
    data: {
      issue_ids: string[];
    }
  ): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bulk-delete-issues/`, data)
      .then(async (response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkArchiveIssues(
    workspaceSlug: string,
    projectId: string,
    data: {
      issue_ids: string[];
    }
  ): Promise<{
    archived_at: string;
  }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bulk-archive-issues/`, data)
      .then(async (response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // issue subscriptions
  async getIssueNotificationSubscriptionStatus(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<{
    subscribed: boolean;
  }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/subscribe/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unsubscribeFromIssueNotifications(workspaceSlug: string, projectId: string, issueId: string): Promise<any> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/subscribe/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async subscribeToIssueNotifications(workspaceSlug: string, projectId: string, issueId: string): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/subscribe/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkSubscribeIssues(
    workspaceSlug: string,
    projectId: string,
    data: {
      issue_ids: string[];
    }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/bulk-subscribe-issues/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssueMetaFromURL(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<{
    project_identifier: string;
    sequence_id: string;
  }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/meta/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieveWithIdentifier(
    workspaceSlug: string,
    project_identifier: string,
    issue_sequence: string,
    queries?: any
  ): Promise<TIssue> {
    return this.get(`/api/workspaces/${workspaceSlug}/work-items/${project_identifier}-${issue_sequence}/`, {
      params: queries,
    })
      .then(async (response) => {
        // add is_epic flag when the service type is epic
        if (response.data && this.serviceType === EIssueServiceType.EPICS) {
          response.data.is_epic = true;
        }
        return response?.data;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
