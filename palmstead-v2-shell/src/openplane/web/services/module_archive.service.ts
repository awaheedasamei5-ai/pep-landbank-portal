/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// type
import { API_BASE_URL } from "@plane/constants";
import type { IModule } from "@plane/types";
// helpers
// services
import { APIService } from "@openplane-web/services/api.service";
import { toPlaneModule, type OpModuleRow } from "@openplane-web/lib/palmstead-adapters";
import { requireSupabase } from "@/lib/supabase.client";

async function archivedModuleMembers(moduleIds: string[]): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  if (moduleIds.length === 0) return result;
  const sb = requireSupabase();
  const { data, error } = await sb.from("op_module_members").select("module_id,member_key").in("module_id", moduleIds);
  if (error) throw error;
  for (const row of data ?? []) (result[row.module_id] ??= []).push(row.member_key);
  return result;
}

export class ModuleArchiveService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getArchivedModules(_workspaceSlug: string, projectId: string): Promise<IModule[]> {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("op_modules")
      .select("*")
      .eq("project_id", projectId)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as OpModuleRow[];
    const members = await archivedModuleMembers(rows.map((row) => row.id));
    return rows.map((row) => toPlaneModule(row, members[row.id] ?? [], undefined));
  }

  async getArchivedModuleDetails(_workspaceSlug: string, projectId: string, moduleId: string): Promise<IModule> {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("op_modules")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", moduleId)
      .not("archived_at", "is", null)
      .single();
    if (error) throw error;
    const members = await archivedModuleMembers([moduleId]);
    return toPlaneModule(data as OpModuleRow, members[moduleId] ?? [], undefined);
  }

  async archiveModule(
    _workspaceSlug: string,
    projectId: string,
    moduleId: string,
    expectedUpdatedAt?: string
  ): Promise<{
    archived_at: string;
  }> {
    const sb = requireSupabase();
    const { data, error } = await sb.rpc("set_operation_module_archive", {
      p_project_id: projectId,
      p_module_id: moduleId,
      p_archived: true,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
    if (error) throw error;
    return { archived_at: (data as OpModuleRow).archived_at ?? new Date().toISOString() };
  }

  async restoreModule(
    _workspaceSlug: string,
    projectId: string,
    moduleId: string,
    expectedUpdatedAt?: string
  ): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.rpc("set_operation_module_archive", {
      p_project_id: projectId,
      p_module_id: moduleId,
      p_archived: false,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    });
    if (error) throw error;
  }
}

