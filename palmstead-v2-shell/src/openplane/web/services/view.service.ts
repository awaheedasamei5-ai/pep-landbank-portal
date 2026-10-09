/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IProjectView } from "@plane/types";
import { APIService } from "@openplane-web/services/api.service";
import { requireSupabase } from "@/lib/supabase.client";
import { currentStaffKey, toPlaneView, type OpViewRow } from "@openplane-web/lib/palmstead-adapters";

async function getWorkspaceIdBySlug(workspaceSlug: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("op_workspaces").select("id").eq("slug", workspaceSlug).single();
  if (error || !data) throw error ?? new Error(`Workspace '${workspaceSlug}' not found`);
  return data.id;
}

/** Real op_views CRUD -- "Views" is a saved IIssueFilterOptions bag per
 * project (status/priority/assignee), not plane's full rich_filters
 * expression builder. See palmstead-adapters.ts's toPlaneView for the
 * real scope decision. */
export class ViewService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async createView(workspaceSlug: string, projectId: string, data: Partial<IProjectView>): Promise<IProjectView> {
    const sb = requireSupabase();
    const workspaceId = await getWorkspaceIdBySlug(workspaceSlug);
    const { data: row, error } = await sb
      .from("op_views")
      .insert({
        workspace_id: workspaceId,
        project_id: projectId,
        name: data.name ?? "Untitled view",
        query: data.query ?? {},
        created_by: currentStaffKey(),
      })
      .select("*")
      .single();
    if (error) throw error;
    return toPlaneView(row as OpViewRow);
  }

  async patchView(_workspaceSlug: string, _projectId: string, viewId: string, data: Partial<IProjectView>): Promise<IProjectView> {
    const sb = requireSupabase();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.query !== undefined) patch.query = data.query;
    const { data: row, error } = await sb.from("op_views").update(patch).eq("id", viewId).select("*").single();
    if (error) throw error;
    return toPlaneView(row as OpViewRow);
  }

  async deleteView(_workspaceSlug: string, _projectId: string, viewId: string): Promise<{ success: true }> {
    const sb = requireSupabase();
    const { error } = await sb.from("op_views").delete().eq("id", viewId);
    if (error) throw error;
    return { success: true };
  }

  async getViews(_workspaceSlug: string, projectId: string): Promise<IProjectView[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_views").select("*").eq("project_id", projectId).order("created_at");
    if (error) throw error;
    return ((data ?? []) as OpViewRow[]).map(toPlaneView);
  }

  async getViewDetails(_workspaceSlug: string, _projectId: string, viewId: string): Promise<IProjectView> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_views").select("*").eq("id", viewId).single();
    if (error) throw error;
    return toPlaneView(data as OpViewRow);
  }

  // Favorites are a separate real feature (plane's user-favorite-views
  // join) not built in this slice -- Views here are CRUD + apply only.
  async addViewToFavorites(): Promise<void> {
    return undefined;
  }

  async removeViewFromFavorites(): Promise<void> {
    return undefined;
  }
}
