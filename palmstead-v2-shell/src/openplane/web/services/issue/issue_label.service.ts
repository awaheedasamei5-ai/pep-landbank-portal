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

  /** Guarded server insert into op_labels. */
  async createIssueLabel(_workspaceSlug: string, projectId: string, data: Partial<IIssueLabel>): Promise<IIssueLabel> {
    const sb = requireSupabase();
    const { data: row, error } = await sb.rpc("create_operation_label", {
      p_project_id: projectId,
      p_name: data.name,
      p_color: data.color ?? "#60646C",
      p_parent_id: data.parent ?? null,
    });
    if (error) throw error;
    return toPlaneLabel(row as OpLabelRow);
  }

  /** Guarded stale-checked update of op_labels. */
  async patchIssueLabel(_workspaceSlug: string, projectId: string, labelId: string, data: Partial<IIssueLabel>): Promise<IIssueLabel> {
    const sb = requireSupabase();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.parent !== undefined) patch.parent_id = data.parent;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    const { data: current, error: currentError } = await sb
      .from("op_labels")
      .select("updated_at")
      .eq("id", labelId)
      .eq("project_id", projectId)
      .single();
    if (currentError || !current) throw currentError ?? new Error("Label not found.");
    const { data: row, error } = await sb.rpc("update_operation_label", {
      p_project_id: projectId,
      p_label_id: labelId,
      p_expected_updated_at: current.updated_at,
      p_patch: patch,
    });
    if (error) throw error;
    return toPlaneLabel(row as OpLabelRow);
  }

  /** Guarded delete; child labels are rejected and issue links are audited. */
  async deleteIssueLabel(_workspaceSlug: string, projectId: string, labelId: string): Promise<{ success: true }> {
    const sb = requireSupabase();
    const { data: current, error: currentError } = await sb
      .from("op_labels")
      .select("updated_at")
      .eq("id", labelId)
      .eq("project_id", projectId)
      .single();
    if (currentError || !current) throw currentError ?? new Error("Label not found.");
    const { error } = await sb.rpc("delete_operation_label", {
      p_project_id: projectId,
      p_label_id: labelId,
      p_expected_updated_at: current.updated_at,
    });
    if (error) throw error;
    return { success: true };
  }
}

