/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { IModule, ILinkDetails, ModuleLink, TIssuesResponse } from "@plane/types";
// services
import { APIService } from "@openplane-web/services/api.service";
import { requireSupabase } from "@/lib/supabase.client";
import { toPlaneModule, type OpModuleRow, type ModuleProgressCounts } from "@openplane-web/lib/palmstead-adapters";

async function getModuleMemberIds(moduleIds: string[]): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {};
  if (moduleIds.length === 0) return map;
  const sb = requireSupabase();
  const { data } = await sb.from("op_module_members").select("module_id,member_key").in("module_id", moduleIds);
  (data ?? []).forEach((row: { module_id: string; member_key: string }) => {
    (map[row.module_id] ??= []).push(row.member_key);
  });
  return map;
}

/** Real per-module issue counts by state group, via the real op_issue_modules join table (unlike cycles, an issue can be in several modules). */
async function getModuleProgressCounts(moduleIds: string[]): Promise<ModuleProgressCounts> {
  const counts: ModuleProgressCounts = {};
  if (moduleIds.length === 0) return counts;
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("op_issue_modules")
    .select("module_id, op_issues!inner(archived_at, op_states(group))")
    .in("module_id", moduleIds)
    .is("op_issues.archived_at", null);
  if (error) throw error;
  (data ?? []).forEach(
    (row: { module_id: string; op_issues: { op_states: { group: string } | { group: string }[] | null } | { op_states: { group: string } | { group: string }[] | null }[] }) => {
      const bucket = (counts[row.module_id] ??= {
        total_issues: 0,
        completed_issues: 0,
        backlog_issues: 0,
        started_issues: 0,
        unstarted_issues: 0,
        cancelled_issues: 0,
      });
      bucket.total_issues += 1;
      const issue = Array.isArray(row.op_issues) ? row.op_issues[0] : row.op_issues;
      const group = Array.isArray(issue?.op_states) ? issue.op_states[0]?.group : issue?.op_states?.group;
      if (group === "completed") bucket.completed_issues += 1;
      else if (group === "backlog") bucket.backlog_issues += 1;
      else if (group === "started") bucket.started_issues += 1;
      else if (group === "unstarted") bucket.unstarted_issues += 1;
      else if (group === "cancelled") bucket.cancelled_issues += 1;
    }
  );
  return counts;
}

export class ModuleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getWorkspaceModules(workspaceSlug: string): Promise<IModule[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/modules/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Phase 6: real read from op_modules, with real per-module issue counts and member ids. */
  async getModules(_workspaceSlug: string, projectId: string): Promise<IModule[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_modules").select("*").eq("project_id", projectId).is("archived_at", null).order("sort_order");
    if (error) throw error;
    const rows = (data ?? []) as OpModuleRow[];
    const ids = rows.map((r) => r.id);
    const [counts, members] = await Promise.all([getModuleProgressCounts(ids), getModuleMemberIds(ids)]);
    return rows.map((row) => toPlaneModule(row, members[row.id] ?? [], counts[row.id]));
  }

  /** Permission-checked, atomic module and membership creation. */
  async createModule(_workspaceSlug: string, projectId: string, data: Partial<IModule>): Promise<IModule> {
    const sb = requireSupabase();
    const { data: row, error } = await sb.rpc("create_operation_module", {
      p_project_id: projectId,
      p_name: data.name ?? "",
      p_description: data.description ?? null,
      p_lead_key: typeof data.lead_id === "string" ? data.lead_id : null,
      p_status: data.status ?? "planned",
      p_start_date: data.start_date ?? null,
      p_target_date: data.target_date ?? null,
      p_member_keys: data.member_ids ?? [],
    });
    if (error) throw error;
    return toPlaneModule(row as OpModuleRow, data.member_ids ?? [], undefined);
  }

  async updateModule(workspaceSlug: string, projectId: string, moduleId: string, data: any): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getModuleDetails(_workspaceSlug: string, _projectId: string, moduleId: string): Promise<IModule> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_modules").select("*").eq("id", moduleId).single();
    if (error) throw error;
    const [counts, members] = await Promise.all([getModuleProgressCounts([moduleId]), getModuleMemberIds([moduleId])]);
    return toPlaneModule(data as OpModuleRow, members[moduleId] ?? [], counts[moduleId]);
  }

  /** Permission-checked, stale-write guarded module and membership update. */
  async patchModule(
    _workspaceSlug: string,
    _projectId: string,
    moduleId: string,
    data: Partial<IModule>
  ): Promise<IModule> {
    const sb = requireSupabase();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.description_html !== undefined) patch.description_html = data.description_html;
    if (data.lead_id !== undefined) patch.lead_key = data.lead_id;
    if (data.status !== undefined) patch.status = data.status;
    if (data.start_date !== undefined) patch.start_date = data.start_date;
    if (data.target_date !== undefined) patch.target_date = data.target_date;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    if (data.member_ids !== undefined) patch.member_ids = data.member_ids;
    const { data: row, error } = await sb.rpc("update_operation_module", {
      p_project_id: _projectId,
      p_module_id: moduleId,
      p_expected_updated_at: data.updated_at,
      p_patch: patch,
    });
    if (error) throw error;
    const [counts, members] = await Promise.all([getModuleProgressCounts([moduleId]), getModuleMemberIds([moduleId])]);
    return toPlaneModule(row as OpModuleRow, members[moduleId] ?? data.member_ids ?? [], counts[moduleId]);
  }

  /** Audited permanent deletion; relationship cleanup is one server transaction. */
  async deleteModule(
    _workspaceSlug: string,
    _projectId: string,
    moduleId: string,
    expectedUpdatedAt: string
  ): Promise<{ success: true }> {
    const sb = requireSupabase();
    const { error } = await sb.rpc("delete_operation_module", {
      p_project_id: _projectId,
      p_module_id: moduleId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) throw error;
    return { success: true };
  }

  async getModuleIssues(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    queries?: any,
    config = {}
  ): Promise<TIssuesResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issues/`,
      {
        params: queries,
      },
      config
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addIssuesToModule(
    _workspaceSlug: string,
    projectId: string,
    moduleId: string,
    data: { issues: string[] }
  ): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.rpc("change_operation_module_issues", {
      p_project_id: projectId,
      p_module_id: moduleId,
      p_issue_ids: data.issues,
      p_add: true,
    });
    if (error) throw error;
  }

  async addModulesToIssue(
    _workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { modules: string[]; removed_modules?: string[] }
  ): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.rpc("change_operation_issue_modules", {
      p_project_id: projectId,
      p_issue_id: issueId,
      p_add_module_ids: data.modules,
      p_remove_module_ids: data.removed_modules ?? [],
    });
    if (error) throw error;
  }

  async removeIssuesFromModuleBulk(
    _workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueIds: string[]
  ): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.rpc("change_operation_module_issues", {
      p_project_id: projectId,
      p_module_id: moduleId,
      p_issue_ids: issueIds,
      p_add: false,
    });
    if (error) throw error;
  }

  async removeModulesFromIssueBulk(
    _workspaceSlug: string,
    projectId: string,
    issueId: string,
    moduleIds: string[]
  ): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.rpc("change_operation_issue_modules", {
      p_project_id: projectId,
      p_issue_id: issueId,
      p_add_module_ids: [],
      p_remove_module_ids: moduleIds,
    });
    if (error) throw error;
  }

  async createModuleLink(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    data: Partial<ModuleLink>
  ): Promise<ILinkDetails> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/module-links/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async updateModuleLink(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    linkId: string,
    data: Partial<ModuleLink>
  ): Promise<ILinkDetails> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/module-links/${linkId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async deleteModuleLink(workspaceSlug: string, projectId: string, moduleId: string, linkId: string): Promise<any> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/module-links/${linkId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addModuleToFavorites(
    workspaceSlug: string,
    projectId: string,
    data: {
      module: string;
    }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-modules/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeModuleFromFavorites(workspaceSlug: string, projectId: string, moduleId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-modules/${moduleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

