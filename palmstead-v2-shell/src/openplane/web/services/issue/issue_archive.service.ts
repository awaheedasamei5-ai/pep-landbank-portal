/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { APIService } from "@openplane-web/services/api.service";
import { API_BASE_URL } from "@plane/constants";
import type { TIssue, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";

import { requireSupabase } from "@/lib/supabase.client";
// types
// constants

export class IssueArchiveService extends APIService {
  private serviceType: TIssueServiceType;

  constructor(serviceType: TIssueServiceType = EIssueServiceType.ISSUES) {
    super(API_BASE_URL);
    this.serviceType = serviceType;
  }

  async getArchivedIssues(workspaceSlug: string, projectId: string, queries?: any, config = {}): Promise<any> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/archived-issues/`,
      {
        params: { ...queries },
      },
      config
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Phase 6: real op_issues.archived_at write, replacing plane's own /archive/ endpoint. */
  async archiveIssue(
    _workspaceSlug: string,
    _projectId: string,
    issueId: string
  ): Promise<{
    archived_at: string;
  }> {
    const sb = requireSupabase();
    const { data: current, error: currentError } = await sb
      .from("op_issues")
      .select("updated_at")
      .eq("id", issueId)
      .single();
    if (currentError || !current) throw currentError ?? new Error("Work item not found.");
    const { data, error } = await sb.rpc("archive_operation_issue", {
      p_issue_id: issueId,
      p_expected_updated_at: current.updated_at,
    });
    if (error || !data?.archived_at) throw error ?? new Error("Work item archive returned no record.");
    return { archived_at: data.archived_at };
  }

  async restoreIssue(_workspaceSlug: string, _projectId: string, issueId: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.rpc("restore_operation_issue", { p_issue_id: issueId });
    if (error) throw error;
  }

  async retrieveArchivedIssue(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    queries?: any
  ): Promise<TIssue> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/archive/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

