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
  status: "pending" | "approved" | "sent" | "dismissed";
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

export function useApproveAndSendDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { data, error } = await requireSupabase().rpc("approve_outbound_sms_draft", { p_id: id, p_body: body });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
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

export function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "That could not be completed. Try again.";
}
