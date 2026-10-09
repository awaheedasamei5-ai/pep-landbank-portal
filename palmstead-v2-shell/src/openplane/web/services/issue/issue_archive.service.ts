/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssue, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { APIService } from "@openplane-web/services/api.service";
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
    const archivedAt = new Date().toISOString();
    const { error } = await sb.from("op_issues").update({ archived_at: archivedAt }).eq("id", issueId);
    if (error) throw error;
    return { archived_at: archivedAt };
  }

  async restoreIssue(_workspaceSlug: string, _projectId: string, issueId: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from("op_issues").update({ archived_at: null }).eq("id", issueId);
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
