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
import { currentStaffKey, toPlaneModule, type OpModuleRow, type ModuleProgressCounts } from "@openplane-web/lib/palmstead-adapters";

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

  /** Phase 6: real insert into op_modules. */
  async createModule(workspaceSlug: string, projectId: string, data: Partial<IModule>): Promise<IModule> {
    const sb = requireSupabase();
    const workspaceId = (await sb.from("op_projects").select("workspace_id").eq("id", projectId).single()).data?.workspace_id;
    const staffKey = currentStaffKey();
    const { data: row, error } = await sb
      .from("op_modules")
      .insert({
        workspace_id: workspaceId,
        project_id: projectId,
        name: data.name,
        description: data.description ?? null,
        lead_key: typeof data.lead_id === "string" ? data.lead_id : staffKey,
        status: data.status ?? "planned",
        start_date: data.start_date ?? null,
        target_date: data.target_date ?? null,
        created_by: staffKey,
      })
      .select("*")
      .single();
    if (error) throw error;
    if (data.member_ids?.length) {
      await sb.from("op_module_members").insert(data.member_ids.map((memberKey) => ({ module_id: row.id, member_key: memberKey })));
    }
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

  /** Phase 6: real update of op_modules (+ reconciling op_module_members when member_ids is provided). */
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
    if (data.status !== undefined) patch.status = data.status;
    if (data.start_date !== undefined) patch.start_date = data.start_date;
    if (data.target_date !== undefined) patch.target_date = data.target_date;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    const { data: row, error } = await sb.from("op_modules").update(patch).eq("id", moduleId).select("*").single();
    if (error) throw error;
    if (data.member_ids !== undefined) {
      await sb.from("op_module_members").delete().eq("module_id", moduleId);
      if (data.member_ids.length) {
        await sb.from("op_module_members").insert(data.member_ids.map((memberKey) => ({ module_id: moduleId, member_key: memberKey })));
      }
    }
    const [counts, members] = await Promise.all([getModuleProgressCounts([moduleId]), getModuleMemberIds([moduleId])]);
    return toPlaneModule(row as OpModuleRow, members[moduleId] ?? data.member_ids ?? [], counts[moduleId]);
  }

  /**
   * Phase 6: real delete from op_modules. op_issue_modules/op_module_members
   * both cascade on delete (real FKs, `on delete cascade` in the schema).
   */
  async deleteModule(_workspaceSlug: string, _projectId: string, moduleId: string): Promise<{ success: true }> {
    const sb = requireSupabase();
    const { error } = await sb.from("op_modules").delete().eq("id", moduleId);
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
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    data: { issues: string[] }
  ): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issues/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addModulesToIssue(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { modules: string[]; removed_modules?: string[] }
  ): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/modules/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeIssuesFromModuleBulk(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueIds: string[]
  ): Promise<void> {
    const promiseDataUrls: any = [];
    issueIds.forEach((issueId) => {
      promiseDataUrls.push(
        this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issues/${issueId}/`)
      );
    });
    await Promise.all(promiseDataUrls)
      .then((response) => response)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeModulesFromIssueBulk(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    moduleIds: string[]
  ): Promise<void> {
    const promiseDataUrls: any = [];
    moduleIds.forEach((moduleId) => {
      promiseDataUrls.push(
        this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issues/${issueId}/`)
      );
    });
    await Promise.all(promiseDataUrls)
      .then((response) => response)
      .catch((error) => {
        throw error?.response?.data;
      });
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
