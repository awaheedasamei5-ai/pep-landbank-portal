/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// services
import { API_BASE_URL } from "@plane/constants";
import type {
  CycleDateCheckData,
  ICycle,
  TIssuesResponse,
  IWorkspaceActiveCyclesResponse,
  TCycleDistribution,
  TProgressSnapshot,
  TCycleEstimateDistribution,
} from "@plane/types";
import { APIService } from "@openplane-web/services/api.service";
import { requireSupabase } from "@/lib/supabase.client";
import { currentStaffKey, toPlaneCycle, type OpCycleRow, type CycleProgressCounts } from "@openplane-web/lib/palmstead-adapters";

async function getWorkspaceIdBySlug(workspaceSlug: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("op_workspaces").select("id").eq("slug", workspaceSlug).single();
  if (error || !data) throw error ?? new Error(`Workspace '${workspaceSlug}' not found`);
  return data.id;
}

/** Real counts of each cycle's issues by state group, in one grouped query for the whole list. */
async function getCycleProgressCounts(cycleIds: string[]): Promise<CycleProgressCounts> {
  const counts: CycleProgressCounts = {};
  if (cycleIds.length === 0) return counts;
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("op_issues")
    .select("cycle_id, op_states(group)")
    .in("cycle_id", cycleIds)
    .is("archived_at", null);
  if (error) throw error;
  (data ?? []).forEach((row: { cycle_id: string | null; op_states: { group: string } | { group: string }[] | null }) => {
    if (!row.cycle_id) return;
    const bucket = (counts[row.cycle_id] ??= {
      total_issues: 0,
      completed_issues: 0,
      backlog_issues: 0,
      started_issues: 0,
      unstarted_issues: 0,
      cancelled_issues: 0,
    });
    bucket.total_issues += 1;
    const group = Array.isArray(row.op_states) ? row.op_states[0]?.group : row.op_states?.group;
    if (group === "completed") bucket.completed_issues += 1;
    else if (group === "backlog") bucket.backlog_issues += 1;
    else if (group === "started") bucket.started_issues += 1;
    else if (group === "unstarted") bucket.unstarted_issues += 1;
    else if (group === "cancelled") bucket.cancelled_issues += 1;
  });
  return counts;
}

export class CycleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async workspaceActiveCyclesAnalytics(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    analytic_type: string = "points"
  ): Promise<TCycleDistribution | TCycleEstimateDistribution> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/analytics?type=${analytic_type}`
    )
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async workspaceActiveCyclesProgress(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TProgressSnapshot> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/progress/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async workspaceActiveCyclesProgressPro(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TProgressSnapshot> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-progress/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async workspaceActiveCycles(
    workspaceSlug: string,
    cursor: string,
    per_page: number
  ): Promise<IWorkspaceActiveCyclesResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/active-cycles/`, {
      params: {
        per_page,
        cursor,
      },
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getWorkspaceCycles(workspaceSlug: string): Promise<ICycle[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/cycles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Phase 6: real insert into op_cycles. */
  async createCycle(workspaceSlug: string, projectId: string, data: Partial<ICycle>): Promise<ICycle> {
    const sb = requireSupabase();
    const workspaceId = await getWorkspaceIdBySlug(workspaceSlug);
    const staffKey = currentStaffKey();
    const { data: row, error } = await sb
      .from("op_cycles")
      .insert({
        workspace_id: workspaceId,
        project_id: projectId,
        name: data.name,
        description: data.description ?? null,
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        owned_by_key: staffKey,
        created_by: staffKey,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toPlaneCycle(row as OpCycleRow, undefined);
  }

  /**
   * Phase 6: real read from op_cycles, with real per-cycle issue counts.
   * cycleType "current" filters to the one cycle whose date range covers
   * today (plane's own semantics), matching deriveCycleStatus's logic.
   */
  async getCyclesWithParams(_workspaceSlug: string, projectId: string, cycleType?: "current"): Promise<ICycle[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_cycles").select("*").eq("project_id", projectId).is("archived_at", null).order("sort_order");
    if (error) throw error;
    const rows = (data ?? []) as OpCycleRow[];
    const counts = await getCycleProgressCounts(rows.map((r) => r.id));
    const cycles = rows.map((row) => toPlaneCycle(row, counts[row.id]));
    return cycleType === "current" ? cycles.filter((c) => c.status === "current") : cycles;
  }

  async getCycleDetails(_workspaceSlug: string, _projectId: string, cycleId: string): Promise<ICycle> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_cycles").select("*").eq("id", cycleId).single();
    if (error) throw error;
    const counts = await getCycleProgressCounts([cycleId]);
    return toPlaneCycle(data as OpCycleRow, counts[cycleId]);
  }

  async getCycleIssues(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    queries?: any,
    config = {}
  ): Promise<TIssuesResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-issues/`,
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

  /** Phase 6: real update of op_cycles. */
  async patchCycle(_workspaceSlug: string, _projectId: string, cycleId: string, data: Partial<ICycle>): Promise<ICycle> {
    const sb = requireSupabase();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.start_date !== undefined) patch.start_date = data.start_date;
    if (data.end_date !== undefined) patch.end_date = data.end_date;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    const { data: row, error } = await sb.from("op_cycles").update(patch).eq("id", cycleId).select("*").single();
    if (error) throw error;
    const counts = await getCycleProgressCounts([cycleId]);
    return toPlaneCycle(row as OpCycleRow, counts[cycleId]);
  }

  /**
   * Phase 6: real delete from op_cycles. op_issues.cycle_id has no ON
   * DELETE behaviour in the schema (plain FK), so issues assigned to this
   * cycle are unassigned first -- otherwise the delete would fail outright
   * on the real foreign key constraint.
   */
  async deleteCycle(_workspaceSlug: string, _projectId: string, cycleId: string): Promise<{ success: true }> {
    const sb = requireSupabase();
    await sb.from("op_issues").update({ cycle_id: null }).eq("cycle_id", cycleId);
    const { error } = await sb.from("op_cycles").delete().eq("id", cycleId);
    if (error) throw error;
    return { success: true };
  }

  async cycleDateCheck(workspaceSlug: string, projectId: string, data: CycleDateCheckData): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/date-check/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addCycleToFavorites(
    workspaceSlug: string,
    projectId: string,
    data: {
      cycle: string;
    }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-cycles/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async transferIssues(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    data: {
      new_cycle_id: string;
    }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/transfer-issues/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeCycleFromFavorites(workspaceSlug: string, projectId: string, cycleId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-cycles/${cycleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
