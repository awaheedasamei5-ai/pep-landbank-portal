/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueActivity, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { APIService } from "@openplane-web/services/api.service";
import { requireSupabase } from "@/lib/supabase.client";
import { buildActivityContext, toPlaneActivity, type OpIssueActivityRow } from "@openplane-web/lib/palmstead-adapters";
// types
// helper

export class IssueActivityService extends APIService {
  private serviceType: TIssueServiceType;

  constructor(serviceType: TIssueServiceType = EIssueServiceType.ISSUES) {
    super(API_BASE_URL);
    this.serviceType = serviceType;
  }

  /** Phase 6: real read from op_issue_activity -- the full audit trail (who changed what, old -> new). */
  async getIssueActivities(_workspaceSlug: string, projectId: string, issueId: string, _params: object = {}): Promise<TIssueActivity[]> {
    const sb = requireSupabase();
    const { data, error } = await sb.from("op_issue_activity").select("*").eq("issue_id", issueId).order("created_at");
    if (error) throw error;
    const rows = (data ?? []) as OpIssueActivityRow[];
    const ctx = await buildActivityContext(sb, projectId, issueId, rows.map((r) => r.actor_key));
    return rows.map((row) => toPlaneActivity(row, ctx));
  }
}
