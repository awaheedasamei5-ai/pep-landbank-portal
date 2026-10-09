/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  GithubRepositoriesResponse,
  IProjectUserPropertiesResponse,
  ISearchIssueResponse,
  TProjectAnalyticsCount,
  TProjectAnalyticsCountParams,
  TProjectIssuesSearchParams,
} from "@plane/types";
// helpers
// plane web types
import type { TProject, TPartialProject } from "@plane/types";
// services
import { APIService } from "@openplane-web/services/api.service";
import { requireSupabase } from "@/lib/supabase.client";
import { toPlaneProject, currentStaffKey, type OpProjectRow } from "@openplane-web/lib/palmstead-adapters";

async function getWorkspaceIdBySlug(workspaceSlug: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("op_workspaces").select("id").eq("slug", workspaceSlug).single();
  if (error || !data) throw error ?? new Error(`Workspace '${workspaceSlug}' not found`);
  return data.id;
}

export class ProjectService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /**
   * Phase 4b: real insert into op_projects, replacing plane's own
   * POST /api/workspaces/:slug/projects/. next_work_item_sequence starts at
   * 1 per the schema default; identifier is required by the real
   * (workspace_id, identifier) unique constraint.
   */
  async createProject(workspaceSlug: string, data: Partial<TProject>): Promise<TProject> {
    const sb = requireSupabase();
    const workspaceId = await getWorkspaceIdBySlug(workspaceSlug);
    const staffKey = currentStaffKey();
    const { data: row, error } = await sb
      .from("op_projects")
      .insert({
        workspace_id: workspaceId,
        name: data.name,
        identifier: data.identifier,
        description: data.description ?? null,
        logo_props: data.logo_props ?? { emoji: { value: "📁" } },
        network: data.network ?? 2,
        project_lead_key: typeof data.project_lead === "string" ? data.project_lead : staffKey,
        created_by: staffKey,
        updated_by: staffKey,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toPlaneProject(row as OpProjectRow) as TProject;
  }

  async checkProjectIdentifierAvailability(workspaceSlug: string, identifier: string): Promise<{ exists: boolean }> {
    const sb = requireSupabase();
    const workspaceId = await getWorkspaceIdBySlug(workspaceSlug);
    const { count, error } = await sb
      .from("op_projects")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("identifier", identifier);
    if (error) throw error;
    return { exists: (count ?? 0) > 0 };
  }

  async getProjectsLite(workspaceSlug: string): Promise<TPartialProject[]> {
    return this.getProjects(workspaceSlug);
  }

  /** Phase 4b: real read from op_projects, replacing /projects/details/. */
  async getProjects(workspaceSlug: string): Promise<TProject[]> {
    const sb = requireSupabase();
    const workspaceId = await getWorkspaceIdBySlug(workspaceSlug);
    const { data, error } = await sb
      .from("op_projects")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return ((data ?? []) as OpProjectRow[]).map(toPlaneProject) as TProject[];
  }

  async getProject(workspaceSlug: string, projectId: string): Promise<TProject> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_projects").select("*").eq("id", projectId).single();
    if (error) throw error;
    return toPlaneProject(data as OpProjectRow) as TProject;
  }

  async getProjectAnalyticsCount(
    workspaceSlug: string,
    params?: TProjectAnalyticsCountParams
  ): Promise<TProjectAnalyticsCount[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/project-stats/`, {
      params,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProject(_workspaceSlug: string, projectId: string, data: Partial<TProject>): Promise<TProject> {
    const sb = requireSupabase();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.identifier !== undefined) patch.identifier = data.identifier;
    if (data.description !== undefined) patch.description = data.description;
    if (data.logo_props !== undefined) patch.logo_props = data.logo_props;
    if (data.network !== undefined) patch.network = data.network;
    if (data.cycle_view !== undefined) patch.cycle_view = data.cycle_view;
    if (data.module_view !== undefined) patch.module_view = data.module_view;
    if (data.issue_views_view !== undefined) patch.issue_views_view = data.issue_views_view;
    if (data.page_view !== undefined) patch.page_view = data.page_view;
    if (data.inbox_view !== undefined) patch.inbox_view = data.inbox_view;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    patch.updated_by = currentStaffKey();
    const { data: row, error } = await sb.from("op_projects").update(patch).eq("id", projectId).select("*").single();
    if (error) throw error;
    return toPlaneProject(row as OpProjectRow) as TProject;
  }

  async deleteProject(_workspaceSlug: string, projectId: string): Promise<any> {
    const sb = requireSupabase();
    const { error } = await sb.from("op_projects").delete().eq("id", projectId);
    if (error) throw error;
    return { success: true };
  }

  // User Properties
  async getProjectUserProperties(workspaceSlug: string, projectId: string): Promise<IProjectUserPropertiesResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-properties/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Phase 4b simplification: Palmstead's op_projects.sort_order is one
   * shared column, not plane's own per-user view-properties row -- this
   * only reaches here from project.store.ts's updateProjectView for
   * sort_order, so a direct column patch is the real, honest equivalent
   * rather than building out a whole unused per-user-prefs table.
   */
  async updateProjectUserProperties(
    _workspaceSlug: string,
    projectId: string,
    data: Partial<IProjectUserPropertiesResponse> & { sort_order?: number }
  ): Promise<IProjectUserPropertiesResponse> {
    if (data.sort_order === undefined) return data as IProjectUserPropertiesResponse;
    const sb = requireSupabase();
    const { error } = await sb.from("op_projects").update({ sort_order: data.sort_order }).eq("id", projectId);
    if (error) throw error;
    return data as IProjectUserPropertiesResponse;
  }

  async getGithubRepositories(url: string): Promise<GithubRepositoriesResponse> {
    return this.request({
      method: "get",
      url,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async syncGithubRepository(
    workspaceSlug: string,
    projectId: string,
    workspaceIntegrationId: string,
    data: {
      name: string;
      owner: string;
      repository_id: string;
      url: string;
    }
  ): Promise<any> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/workspace-integrations/${workspaceIntegrationId}/github-repository-sync/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProjectGithubRepository(workspaceSlug: string, projectId: string, integrationId: string): Promise<any> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/workspace-integrations/${integrationId}/github-repository-sync/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getUserProjectFavorites(workspaceSlug: string): Promise<any[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/user-favorite-projects/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addProjectToFavorites(workspaceSlug: string, project: string): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/user-favorite-projects/`, { project })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeProjectFromFavorites(workspaceSlug: string, projectId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/user-favorite-projects/${projectId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async projectIssuesSearch(
    workspaceSlug: string,
    projectId: string,
    params: TProjectIssuesSearchParams
  ): Promise<ISearchIssueResponse[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/search-issues/`, {
      params,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
