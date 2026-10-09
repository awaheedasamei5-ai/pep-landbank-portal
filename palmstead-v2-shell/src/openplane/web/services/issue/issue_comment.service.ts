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

  /** Phase 6: real insert into op_issue_comments. */
  async createIssueComment(_workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssueComment>): Promise<TIssueComment> {
    const sb = requireSupabase();
    const staffKey = currentStaffKey();
    const { data: row, error } = await sb
      .from("op_issue_comments")
      .insert({ issue_id: issueId, comment_html: data.comment_html ?? "", actor_key: staffKey })
      .select("*")
      .single();
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
    const { data: row, error } = await sb
      .from("op_issue_comments")
      .update({ comment_html: data.comment_html })
      .eq("id", commentId)
      .select("*")
      .single();
    if (error) throw error;
    const ctx = await buildActivityContext(sb, projectId, issueId, [row.actor_key]);
    return toPlaneComment(row as OpIssueCommentRow, ctx);
  }

  /** Phase 6: real delete from op_issue_comments. */
  async deleteIssueComment(_workspaceSlug: string, _projectId: string, _issueId: string, commentId: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from("op_issue_comments").delete().eq("id", commentId);
    if (error) throw error;
  }
}
