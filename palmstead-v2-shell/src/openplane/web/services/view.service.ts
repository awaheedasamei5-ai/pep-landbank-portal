/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IProjectView } from "@plane/types";
import { APIService } from "@openplane-web/services/api.service";
import { requireSupabase } from "@/lib/supabase.client";
import { toPlaneView, type OpViewRow } from "@openplane-web/lib/palmstead-adapters";

/** Real op_views CRUD -- "Views" is a saved IIssueFilterOptions bag per
 * project (status/priority/assignee), not plane's full rich_filters
 * expression builder. See palmstead-adapters.ts's toPlaneView for the
 * real scope decision. */
export class ViewService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async createView(_workspaceSlug: string, projectId: string, data: Partial<IProjectView>): Promise<IProjectView> {
    const sb = requireSupabase();
    const { data: row, error } = await sb.rpc("create_operation_view", {
      p_project_id: projectId,
      p_name: data.name ?? "Untitled view",
      p_query: data.query ?? {},
    });
    if (error) throw error;
    return toPlaneView(row as OpViewRow);
  }

  async patchView(_workspaceSlug: string, _projectId: string, viewId: string, data: Partial<IProjectView>): Promise<IProjectView> {
    const sb = requireSupabase();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.query !== undefined) patch.query = data.query;
    const expectedUpdatedAt =
      data.updated_at instanceof Date ? data.updated_at.toISOString() : data.updated_at;
    const { data: row, error } = await sb.rpc("update_operation_view", {
      p_project_id: _projectId,
      p_view_id: viewId,
      p_expected_updated_at: expectedUpdatedAt,
      p_patch: patch,
    });
    if (error) throw error;
    return toPlaneView(row as OpViewRow);
  }

  async deleteView(
    _workspaceSlug: string,
    _projectId: string,
    viewId: string,
    expectedUpdatedAt: string
  ): Promise<{ success: true }> {
    const sb = requireSupabase();
    const { error } = await sb.rpc("delete_operation_view", {
      p_project_id: _projectId,
      p_view_id: viewId,
      p_expected_updated_at: expectedUpdatedAt,
    });
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

