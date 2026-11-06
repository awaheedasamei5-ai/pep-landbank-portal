"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Outgoing SMS app (docs/plans/43 follow-up request, 2026-11-06): a real,
// Management-only place to see and edit every automated SMS's base text/
// AI prompt (sms_templates), and to review/approve/dismiss the one kind
// that genuinely requires human sign-off before it reaches a client --
// the new closing/nurture campaign (outbound_sms_drafts). Every other
// automated kind (due-soon, missed-payment, staff digest, quotation/SVE/
// receipt thank-yous) stays auto-sent exactly as before; only its wording
// is now editable here.

export type SmsTemplate = {
  id: string;
  kind: string;
  label: string;
  description: string;
  body_template: string | null;
  ai_system_prompt: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type OutboundDraft = {
  id: string;
  kind: string;
  lead_id: string | null;
  recipient_name: string;
  recipient_phone: string | null;
  body: string;
  angle: string | null;
  status: "pending" | "approved" | "sent" | "dismissed" | "needs_review";
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
};

async function requireManager(): Promise<true> {
  const client = requireSupabase();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Sign in to use Outgoing SMS.");
  const { data: me, error: meError } = await client.from("profiles").select("role,active").eq("id", auth.user.id).single();
  if (meError || me?.role !== "manager" || me?.active !== true) {
    throw new Error("Only active Management can review outgoing SMS.");
  }
  return true;
}

export function useOutgoingSmsGuard() {
  return useQuery({ queryKey: ["outgoing-sms-guard"], queryFn: requireManager, retry: false });
}

export function useSmsTemplates() {
  return useQuery({
    queryKey: ["sms-templates"],
    queryFn: async (): Promise<SmsTemplate[]> => {
      const { data, error } = await requireSupabase().from("sms_templates").select("*").order("label");
      if (error) throw error;
      return (data ?? []) as SmsTemplate[];
    },
  });
}

export function useSaveSmsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body_template, ai_system_prompt }: { id: string; body_template: string | null; ai_system_prompt: string | null }) => {
      const { data: auth } = await requireSupabase().auth.getUser();
      const { data: me } = await requireSupabase().from("profiles").select("agent_key").eq("id", auth.user?.id ?? "").maybeSingle();
      const { error } = await requireSupabase()
        .from("sms_templates")
        .update({ body_template, ai_system_prompt, updated_by: me?.agent_key ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sms-templates"] }),
  });
}

export function useOutboundDrafts(status: OutboundDraft["status"] | "all") {
  return useQuery({
    queryKey: ["outbound-sms-drafts", status],
    queryFn: async (): Promise<OutboundDraft[]> => {
      let query = requireSupabase().from("outbound_sms_drafts").select("*").order("created_at", { ascending: false }).limit(300);
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as OutboundDraft[];
    },
  });
}

// A draft held by Phase E's enforced validator (kinds with sms_templates.
// review_enforced = true) needs to stay visible for Management to edit and
// resubmit, alongside the normal pending queue -- not a separate tab.
export function useReviewableOutboundDrafts() {
  return useQuery({
    queryKey: ["outbound-sms-drafts", "reviewable"],
    queryFn: async (): Promise<OutboundDraft[]> => {
      const { data, error } = await requireSupabase()
        .from("outbound_sms_drafts")
        .select("*")
        .in("status", ["pending", "needs_review"])
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as OutboundDraft[];
    },
  });
}

export function useApproveAndSendDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { data, error } = await requireSupabase().rpc("approve_outbound_sms_draft", { p_id: id, p_body: body });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      // Phase E: a kind with review_enforced=true can hold the draft at
      // 'needs_review' instead of approving it, if the deterministic
      // validator finds a real factual mismatch against a fresh read of
      // the trusted data. Surface that as a normal thrown error so the
      // existing dialog's catch(e) path shows it -- no real send happens.
      if ((row as { blocked?: boolean } | null)?.blocked) {
        throw new Error((row as { block_reason?: string }).block_reason ?? "This message was held for review.");
      }
      const phone = (row as { recipient_phone?: string | null } | null)?.recipient_phone ?? null;
      const finalBody = (row as { body?: string } | null)?.body ?? body;
      if (phone) {
        // Fire-and-forget, matching the established ds.sms.send/
        // recalc-proposals-panel discipline elsewhere in this app.
        await requireSupabase()
          .functions.invoke("send-sms", { body: { to: phone, message: finalBody, sender: "Palmstead" } })
          .catch(() => {});
      }
      await requireSupabase().rpc("mark_outbound_sms_draft_sent", { p_id: id });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outbound-sms-drafts"] }),
    // A blocked attempt still moved the draft to 'needs_review' in the DB
    // before throwing -- refetch so the list reflects that, not just the
    // error dialog.
    onError: () => queryClient.invalidateQueries({ queryKey: ["outbound-sms-drafts"] }),
  });
}

export function useDismissDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().rpc("dismiss_outbound_sms_draft", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outbound-sms-drafts"] }),
  });
}

export type QueueSummaryRow = {
  source_label: string;
  pending_count: number;
  problem_count: number;
  last_activity_at: string | null;
};

export function useOutgoingSmsQueueSummary() {
  return useQuery({
    queryKey: ["outgoing-sms-queue-summary"],
    queryFn: async (): Promise<QueueSummaryRow[]> => {
      const { data, error } = await requireSupabase().rpc("get_outgoing_sms_queue_summary");
      if (error) throw error;
      return (data ?? []) as QueueSummaryRow[];
    },
  });
}

// Phase D (docs/plans/48): shadow-mode AI review results, keyed by the
// outbox row they were computed for. Read-only, informational only -- this
// does not gate sending anything yet, it's the measurement step before
// Phase E decides whether to trust it to.
export type ShadowReview = {
  outbox_row_id: string;
  ai_decision: string | null;
  ai_reason_codes: string[];
  validator_verdict: string;
  validator_issues: { code: string; value: string }[];
};

export function useShadowReviews(draftIds: string[]) {
  return useQuery({
    queryKey: ["sms-review-shadow-log", draftIds],
    enabled: draftIds.length > 0,
    queryFn: async (): Promise<Record<string, ShadowReview>> => {
      const { data, error } = await requireSupabase()
        .from("sms_review_shadow_log")
        .select("outbox_row_id,ai_decision,ai_reason_codes,validator_verdict,validator_issues")
        .in("outbox_row_id", draftIds);
      if (error) throw error;
      const byId: Record<string, ShadowReview> = {};
      for (const row of (data ?? []) as ShadowReview[]) {
        if (row.outbox_row_id) byId[row.outbox_row_id] = row;
      }
      return byId;
    },
  });
}

export function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "That could not be completed. Try again.";
}

// Sample values for every {token} used across the real templates (Phase B
// item 4, docs/plans/48 Sec 9) -- a preview is read-only and never sent, so
// using realistic-looking sample data here is safe and lets Management see
// exactly what an edit will produce before saving it.
const SAMPLE_VARS: Record<string, string> = {
  name: "Kofi Mensah",
  clientName: "Kofi Mensah",
  firstName: "Kofi",
  staffName: "Elias Torgbuivi",
  agentName: "Elias Torgbuivi",
  amount: "GHS 3,500.00",
  plotType: "full plot",
  dueDate: "27 November 2026",
  overdueList: "GHS 3,500.00 (due 27 September 2026); GHS 3,500.00 (due 27 October 2026)",
  clientList: "Kofi Mensah - GHS 3,500.00 (full plot, overdue since 27 October 2026)",
  logPaymentLink: "https://palmstead-v2-shell.vercel.app/dashboard/finance?tab=payments&action=log-payment",
  paymentPlan: "12 Months",
  link: "https://palmstead-v2-shell.vercel.app/quotation/sample-token",
  receiptNumber: "RCT-000123",
  receiptUrl: "https://palmstead-v2-shell.vercel.app/receipt/sample-token",
  percent: "72",
  date: "2026-11-06",
  kind: "morning plan",
  days: "3",
  startDate: "10 November 2026",
  endDate: "12 November 2026",
  emergencyWord: "a",
  site: "Royal Palm Enclave",
  dateLabel: "Friday 07 November 2026",
  timeLine: " at 10:00am",
  pickupLine: ". We'll pick you up at Accra Mall",
};

export function renderTemplatePreview(template: string): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in SAMPLE_VARS ? SAMPLE_VARS[key] : match));
}

// AI-drafted kinds need a real call to ai-insights (no send involved) to
// preview, since their output isn't a simple token substitution -- the
// same two real kinds and context shapes already proven in Phase I's
// recalc-proposals-panel and the closing-SMS worker.
export function usePreviewAiTemplate() {
  return useMutation({
    mutationFn: async (kind: string): Promise<string> => {
      const context =
        kind === "payment_schedule_change_sms"
          ? { overpaymentAmount: 1500, settledCount: 2, fullyPaid: false }
          : { plotType: "full plot", angle: "reassurance", hasAgent: true, agentName: "Elias Torgbuivi", agentPhone: "0531083165", companyPhone: "0544330390" };
      const { data, error } = await requireSupabase().functions.invoke("ai-insights", { body: { kind, context } });
      if (error) throw error;
      const message = String((data as { message?: string } | null)?.message ?? "").trim();
      if (!message) throw new Error("The AI did not return a draft. Try again.");
      return message;
    },
  });
}

// Phase C (docs/plans/48): real segment/cost totals from sms_send_log,
// the shared post-send logger every updated sender writes to. Covers the
// kinds that have been wired so far (send-sms's callers, finance monthly
// reminders, allocation notices) -- not yet every kind in the system, see
// docs/plans/48 §Phase C for the honest current coverage list.
export function useSmsSendStats(sinceDays: number) {
  return useQuery({
    queryKey: ["sms-send-stats", sinceDays],
    queryFn: async () => {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      const { data, error } = await requireSupabase()
        .from("sms_send_log")
        .select("segment_count")
        .gte("sent_at", since);
      if (error) throw error;
      const rows = (data ?? []) as { segment_count: number }[];
      const totalSegments = rows.reduce((sum, r) => sum + (r.segment_count ?? 0), 0);
      const { data: configRow } = await requireSupabase().from("app_config").select("sms_cost_per_segment_ghs").limit(1).maybeSingle();
      const rate = (configRow as { sms_cost_per_segment_ghs: number | null } | null)?.sms_cost_per_segment_ghs ?? null;
      return { sendCount: rows.length, totalSegments, estimatedCostGhs: rate != null ? totalSegments * rate : null };
    },
  });
}
