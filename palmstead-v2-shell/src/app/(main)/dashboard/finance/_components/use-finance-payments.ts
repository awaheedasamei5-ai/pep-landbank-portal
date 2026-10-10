"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Payments (Finance app, Part B.1 -- docs/plans/04-finance-app-plan.md).
// Every write that touches a lead's amt_paid/balance goes through the real
// approve_payment/decline_payment/flag_payment_needs_correction/resubmit_payment
// RPCs (SECURITY DEFINER, already live) -- never a bare client update. That is
// the exact lockstep rule this project's own `pipeline-payment-integrity`
// memory exists because of: a prior incident where a deleted test payment
// kept feeding real financial figures because a write path bypassed the
// single real source of truth.
export const PAYMENT_METHODS = ["Ecobank", "Stanbic Bank", "MTN MoMo", "Vodafone Cash", "Hubtel", "Cash", "Other"] as const;

export interface LeadOption {
  id: string;
  name: string;
  contact: string | null;
  agentKey: string;
  plotType: string | null;
  grandTotal: number;
  amtPaid: number;
}

export interface Payment {
  id: string;
  leadId: string;
  leadName: string;
  agentKey: string;
  clientName: string | null;
  amount: number;
  paymentMethod: string | null;
  status: "pending" | "approved" | "declined" | "needs_correction";
  receiptNumber: string | null;
  receiptProofPath: string | null;
  referenceNumber: string | null;
  note: string | null;
  correctionReason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  paymentDate: string;
  createdAt: string;
}

type RawPayment = {
  id: string;
  lead_id: string;
  agent_key: string;
  client_name: string | null;
  amount: number;
  payment_method: string | null;
  status: Payment["status"];
  receipt_number: string | null;
  receipt_proof_path: string | null;
  reference_number: string | null;
  note: string | null;
  correction_reason: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  payment_date: string;
  created_at: string;
  leads: { name: string } | { name: string }[] | null;
};

function leadName(row: RawPayment): string {
  const l = row.leads;
  if (!l) return row.client_name ?? "Unknown";
  return Array.isArray(l) ? (l[0]?.name ?? row.client_name ?? "Unknown") : (l.name ?? row.client_name ?? "Unknown");
}

function mapPayment(row: RawPayment): Payment {
  return {
    id: row.id,
    leadId: row.lead_id,
    leadName: leadName(row),
    agentKey: row.agent_key,
    clientName: row.client_name,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    status: row.status,
    receiptNumber: row.receipt_number,
    receiptProofPath: row.receipt_proof_path,
    referenceNumber: row.reference_number,
    note: row.note,
    correctionReason: row.correction_reason,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
    paymentDate: row.payment_date,
    createdAt: row.created_at,
  };
}

export function useHasPaymentsManage() {
  return useQuery({
    queryKey: ["has-permission", "payments.manage"],
    queryFn: async () => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("has_permission", { p_key: "payments.manage" });
      if (error) throw error;
      return Boolean(data);
    },
  });
}

export function usePayments() {
  return useQuery({
    queryKey: ["finance-payments"],
    queryFn: async (): Promise<Payment[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("payments")
        .select(
          "id,lead_id,agent_key,client_name,amount,payment_method,status,receipt_number,receipt_proof_path,reference_number,note,correction_reason,decided_by_name,decided_at,payment_date,created_at,leads(name)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data ?? []) as unknown as RawPayment[]).map(mapPayment);
    },
  });
}

export function useLeadSearch(search: string) {
  return useQuery({
    queryKey: ["finance-lead-search", search],
    queryFn: async (): Promise<LeadOption[]> => {
      const sb = requireSupabase();
      let query = sb
        .from("leads")
        .select("id,name,contact,agent_key,plot_type,grand_total,amt_paid")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .limit(25);
      if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as { id: string; name: string; contact: string | null; agent_key: string; plot_type: string | null; grand_total: number | null; amt_paid: number | null }[]).map(
        (l) => ({
          id: l.id,
          name: l.name,
          contact: l.contact,
          agentKey: l.agent_key,
          plotType: l.plot_type,
          grandTotal: Number(l.grand_total ?? 0),
          amtPaid: Number(l.amt_paid ?? 0),
        }),
      );
    },
    enabled: true,
  });
}

export function useLogPayment(callerRole: "agent" | "manager" | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lead: LeadOption; amount: number; paymentMethod: string; note: string; referenceNumber: string }) => {
      const sb = requireSupabase();
      const { data: inserted, error } = await sb
        .from("payments")
        .insert({
          lead_id: input.lead.id,
          agent_key: input.lead.agentKey,
          client_name: input.lead.name,
          amount: input.amount,
          payment_method: input.paymentMethod || null,
          note: input.note || null,
          reference_number: input.referenceNumber || null,
          status: "pending",
          payment_date: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) throw error;

      // Management-logged payments still land through the real
      // approve_payment RPC (not a direct amt_paid write) so there is
      // exactly one code path that ever updates a lead's balance -- matching
      // V1's rule that a Management-held login's own payment entries land
      // approved immediately, everyone else's land pending for review.
      if (callerRole === "manager") {
        const { error: approveError } = await sb.rpc("approve_payment", { p_payment_id: inserted.id });
        if (approveError) throw approveError;
      }
      return inserted.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-payments"] });
      qc.invalidateQueries({ queryKey: ["finance-lead-search"] });
    },
  });
}

export function useApprovePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("approve_payment", { p_payment_id: paymentId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-payments"] }),
  });
}

export function useDeclinePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: string; reason: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.rpc("decline_payment", { p_payment_id: paymentId, p_reason: reason || null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-payments"] }),
  });
}

export function useFlagPaymentCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: string; reason: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.rpc("flag_payment_needs_correction", { p_payment_id: paymentId, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-payments"] }),
  });
}

export function useResubmitPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { paymentId: string; amount: number; paymentMethod: string; note: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.rpc("resubmit_payment", {
        p_payment_id: input.paymentId,
        p_amount: input.amount,
        p_payment_method: input.paymentMethod || null,
        p_note: input.note || null,
        p_receipt_proof_path: null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-payments"] }),
  });
}
