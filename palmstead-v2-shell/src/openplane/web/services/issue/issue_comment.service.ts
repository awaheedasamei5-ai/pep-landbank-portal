/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane types
import { API_BASE_URL } from "@plane/constants";
import type { TIssueComment, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// services
import { APIService } from "@openplane-web/services/api.service";
import { FileUploadService } from "@openplane-web/services/file-upload.service";
import { requireSupabase } from "@/lib/supabase.client";
import { buildActivityContext, currentStaffKey, toPlaneComment, type OpIssueCommentRow } from "@openplane-web/lib/palmstead-adapters";

export class IssueCommentService extends APIService {
  private fileUploadService: FileUploadService;
  private serviceType: TIssueServiceType;

  constructor(serviceType: TIssueServiceType = EIssueServiceType.ISSUES) {
    super(API_BASE_URL);
    // upload service
    this.fileUploadService = new FileUploadService();
    this.serviceType = serviceType;
  }

  /** Phase 6: real read from op_issue_comments. */
  async getIssueComments(_workspaceSlug: string, projectId: string, issueId: string, _params: object = {}): Promise<TIssueComment[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_issue_comments").select("*").eq("issue_id", issueId).order("created_at");
    if (error) throw error;
    const rows = (data ?? []) as OpIssueCommentRow[];
    const ctx = await buildActivityContext(sb, projectId, issueId, rows.map((r) => r.actor_key));
    return rows.map((row) => toPlaneComment(row, ctx));
  }

  /** Create an Operations comment through the server-enforced action boundary. */
  async createIssueComment(_workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssueComment>): Promise<TIssueComment> {
    const sb = requireSupabase();
    const staffKey = currentStaffKey();
    const { data: row, error } = await sb.rpc("create_operation_issue_comment", {
      p_issue_id: issueId,
      p_comment_html: data.comment_html ?? "",
    });
    if (error) throw error;
    const ctx = await buildActivityContext(sb, projectId, issueId, [staffKey]);
    return toPlaneComment(row as OpIssueCommentRow, ctx);
  }

  /** Phase 6: real update of op_issue_comments. */
  async patchIssueComment(
    _workspaceSlug: string,
    projectId: string,
    issueId: string,
    commentId: string,
    data: Partial<TIssueComment>
  ): Promise<TIssueComment> {
    const sb = requireSupabase();
    if (!data.updated_at) throw new Error("Reload the comment before editing it.");
    const { data: row, error } = await sb.rpc("update_operation_issue_comment", {
      p_comment_id: commentId,
      p_expected_updated_at: data.updated_at,
      p_comment_html: data.comment_html ?? "",
    });
    if (error) throw error;
    const ctx = await buildActivityContext(sb, projectId, issueId, [row.actor_key]);
    return toPlaneComment(row as OpIssueCommentRow, ctx);
  }

  /** Phase 6: real delete from op_issue_comments. */
  async deleteIssueComment(
    _workspaceSlug: string,
    _projectId: string,
    _issueId: string,
    commentId: string,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    const sb = requireSupabase();
    if (!expectedUpdatedAt) throw new Error("Reload the comment before deleting it.");
    const { error } = await sb.rpc("delete_operation_issue_comment", {
      p_comment_id: commentId,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) throw error;
  }
}
