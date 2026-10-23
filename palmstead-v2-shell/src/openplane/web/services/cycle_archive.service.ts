/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// type
import { API_BASE_URL } from "@plane/constants";
import type { ICycle } from "@plane/types";
// helpers
// services
import { APIService } from "@openplane-web/services/api.service";
import { toPlaneCycle, type OpCycleRow } from "@openplane-web/lib/palmstead-adapters";
import { requireSupabase } from "@/lib/supabase.client";

export class CycleArchiveService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getArchivedCycles(_workspaceSlug: string, projectId: string): Promise<ICycle[]> {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("op_cycles")
      .select("*")
      .eq("project_id", projectId)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as OpCycleRow[]).map((row) => toPlaneCycle(row, undefined));
  }

  async getArchivedCycleDetails(_workspaceSlug: string, projectId: string, cycleId: string): Promise<ICycle> {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("op_cycles")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", cycleId)
      .not("archived_at", "is", null)
      .single();
    if (error) throw error;
    return toPlaneCycle(data as OpCycleRow, undefined);
  }

  async archiveCycle(
    _workspaceSlug: string,
    projectId: string,
    cycleId: string,
    expectedUpdatedAt?: string
  ): Promise<{
    archived_at: string;
  }> {
    const sb = requireSupabase();
    const { data, error } = await sb.rpc("set_operation_cycle_archive", {
      p_project_id: projectId,
      p_cycle_id: cycleId,
      p_archived: true,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
    if (error) throw error;
    return { archived_at: (data as OpCycleRow).archived_at ?? new Date().toISOString() };
  }

  async restoreCycle(
    _workspaceSlug: string,
    projectId: string,
    cycleId: string,
    expectedUpdatedAt?: string
  ): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.rpc("set_operation_cycle_archive", {
      p_project_id: projectId,
      p_cycle_id: cycleId,
      p_archived: false,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
    if (error) throw error;
  }
}

