/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// helpers
import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@openplane-web/services/api.service";
import { requireSupabase } from "@/lib/supabase.client";

export class ProjectArchiveService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async archiveProject(
    _workspaceSlug: string,
    projectId: string
  ): Promise<{
    archived_at: string;
  }> {
    const sb = requireSupabase();
    const { data: current, error: currentError } = await sb.from("op_projects").select("updated_at").eq("id", projectId).single();
    if (currentError || !current) throw currentError ?? new Error("Project not found.");
    const { data, error } = await sb.rpc("archive_operation_project", { p_project_id: projectId, p_expected_updated_at: current.updated_at });
    if (error || !data?.archived_at) throw error ?? new Error("Project archive returned no record.");
    return { archived_at: data.archived_at };
  }

  async restoreProject(_workspaceSlug: string, projectId: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.rpc("restore_operation_project", { p_project_id: projectId });
    if (error) throw error;
  }
}
