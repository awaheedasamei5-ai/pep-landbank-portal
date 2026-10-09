/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IIssueLabel } from "@plane/types";
// services
import { APIService } from "@openplane-web/services/api.service";
import { requireSupabase } from "@/lib/supabase.client";
import { toPlaneLabel, type OpLabelRow } from "@openplane-web/lib/palmstead-adapters";

async function getWorkspaceIdBySlug(workspaceSlug: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("op_workspaces").select("id").eq("slug", workspaceSlug).single();
  if (error || !data) throw error ?? new Error(`Workspace '${workspaceSlug}' not found`);
  return data.id;
}

export class IssueLabelService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** Phase 4b: real read across every project in the workspace. */
  async getWorkspaceIssueLabels(workspaceSlug: string): Promise<IIssueLabel[]> {
    const sb = requireSupabase();
    const workspaceId = await getWorkspaceIdBySlug(workspaceSlug);
    const { data, error } = await sb.from("op_labels").select("*").eq("workspace_id", workspaceId).order("sort_order");
    if (error) throw error;
    return ((data ?? []) as OpLabelRow[]).map(toPlaneLabel);
  }

  /** Phase 4b: real read from op_labels. */
  async getProjectLabels(_workspaceSlug: string, projectId: string): Promise<IIssueLabel[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_labels").select("*").eq("project_id", projectId).order("sort_order");
    if (error) throw error;
    return ((data ?? []) as OpLabelRow[]).map(toPlaneLabel);
  }

  /** Phase 4b: real insert into op_labels. */
  async createIssueLabel(workspaceSlug: string, projectId: string, data: Partial<IIssueLabel>): Promise<IIssueLabel> {
    const sb = requireSupabase();
    const workspaceId = await getWorkspaceIdBySlug(workspaceSlug);
    const { data: row, error } = await sb
      .from("op_labels")
      .insert({
        workspace_id: workspaceId,
        project_id: projectId,
        name: data.name,
        color: data.color ?? "#60646C",
        parent_id: data.parent ?? null,
        sort_order: data.sort_order ?? 0,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toPlaneLabel(row as OpLabelRow);
  }

  /** Phase 4b: real update of op_labels. */
  async patchIssueLabel(_workspaceSlug: string, _projectId: string, labelId: string, data: Partial<IIssueLabel>): Promise<IIssueLabel> {
    const sb = requireSupabase();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.parent !== undefined) patch.parent_id = data.parent;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    const { data: row, error } = await sb.from("op_labels").update(patch).eq("id", labelId).select("*").single();
    if (error) throw error;
    return toPlaneLabel(row as OpLabelRow);
  }

  /** Phase 4b: real delete from op_labels. */
  async deleteIssueLabel(_workspaceSlug: string, _projectId: string, labelId: string): Promise<{ success: true }> {
    const sb = requireSupabase();
    const { error } = await sb.from("op_labels").delete().eq("id", labelId);
    if (error) throw error;
    return { success: true };
  }
}
