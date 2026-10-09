/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// services
import { API_BASE_URL } from "@plane/constants";
import type { IIntakeState, IState } from "@plane/types";
import { APIService } from "@openplane-web/services/api.service";
import { requireSupabase } from "@/lib/supabase.client";
import { toPlaneState, type OpStateRow } from "@openplane-web/lib/palmstead-adapters";

async function getWorkspaceIdBySlug(workspaceSlug: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("op_workspaces").select("id").eq("slug", workspaceSlug).single();
  if (error || !data) throw error ?? new Error(`Workspace '${workspaceSlug}' not found`);
  return data.id;
}

export class ProjectStateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** Phase 4b: real insert into op_states. */
  async createState(workspaceSlug: string, projectId: string, data: Partial<IState>): Promise<IState> {
    const sb = requireSupabase();
    const workspaceId = await getWorkspaceIdBySlug(workspaceSlug);
    const { data: row, error } = await sb
      .from("op_states")
      .insert({
        workspace_id: workspaceId,
        project_id: projectId,
        name: data.name,
        color: data.color ?? "#60646C",
        description: data.description ?? null,
        group: data.group ?? "unstarted",
        sequence: data.sequence ?? 0,
        order: data.order ?? 0,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toPlaneState(row as OpStateRow);
  }

  /** Phase 4b: real update -- clears the project's existing default state first, same single-default invariant plane enforces. */
  async markDefault(_workspaceSlug: string, projectId: string, stateId: string): Promise<void> {
    const sb = requireSupabase();
    const { error: clearError } = await sb.from("op_states").update({ default: false }).eq("project_id", projectId);
    if (clearError) throw clearError;
    const { error } = await sb.from("op_states").update({ default: true }).eq("id", stateId);
    if (error) throw error;
  }

  /** Phase 4b: real read from op_states. */
  async getStates(_workspaceSlug: string, projectId: string): Promise<IState[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_states").select("*").eq("project_id", projectId).order("sequence");
    if (error) throw error;
    return ((data ?? []) as OpStateRow[]).map(toPlaneState);
  }

  async getIntakeState(workspaceSlug: string, projectId: string): Promise<IIntakeState> {
    // Intake (plane's own triage inbox) is deferred -- op_projects.inbox_view
    // exists in the schema but the feature isn't built in this phase.
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/intake-state/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getState(_workspaceSlug: string, _projectId: string, stateId: string): Promise<IState> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_states").select("*").eq("id", stateId).single();
    if (error) throw error;
    return toPlaneState(data as OpStateRow);
  }

  async updateState(workspaceSlug: string, projectId: string, stateId: string, data: IState): Promise<IState> {
    return this.patchState(workspaceSlug, projectId, stateId, data);
  }

  /** Phase 4b: real update of op_states. */
  async patchState(_workspaceSlug: string, _projectId: string, stateId: string, data: Partial<IState>): Promise<IState> {
    const sb = requireSupabase();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.description !== undefined) patch.description = data.description;
    if (data.group !== undefined) patch.group = data.group;
    if (data.sequence !== undefined) patch.sequence = data.sequence;
    if (data.order !== undefined) patch.order = data.order;
    const { data: row, error } = await sb.from("op_states").update(patch).eq("id", stateId).select("*").single();
    if (error) throw error;
    return toPlaneState(row as OpStateRow);
  }

  /** Phase 4b: real delete from op_states. */
  async deleteState(_workspaceSlug: string, _projectId: string, stateId: string): Promise<{ success: true }> {
    const sb = requireSupabase();
    const { error } = await sb.from("op_states").delete().eq("id", stateId);
    if (error) throw error;
    return { success: true };
  }

  /** Phase 4b: real read across every project in the workspace. */
  async getWorkspaceStates(workspaceSlug: string): Promise<IState[]> {
    const sb = requireSupabase();
    const workspaceId = await getWorkspaceIdBySlug(workspaceSlug);
    const { data, error } = await sb.from("op_states").select("*").eq("workspace_id", workspaceId).order("sequence");
    if (error) throw error;
    return ((data ?? []) as OpStateRow[]).map(toPlaneState);
  }
}
