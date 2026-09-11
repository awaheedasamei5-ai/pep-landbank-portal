"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deriveStageFromPayment, type PlotType } from "@/lib/palmstead/pipeline-pricing-logic";
import type { Stage } from "@/lib/palmstead/use-pipeline-leads";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

// Real port of web-next's src/features/pipeline/hooks/useLead.ts -- one
// lead's full real row (not the list-view column subset), for the lead
// detail page. Same real RLS-vs-viewAll shape usePipelineLeads already
// established: manager/elias/emmanuel/elizabeth see any lead by id
// (company-wide RLS already allows it), everyone else only their own.
export interface LeadDetail {
  id: string;
  agentKey: string;
  name: string;
  contact: string;
  date: string;
  plotType: PlotType;
  noPlots: number;
  unitPrice: number;
  paymentPlan: "Full Payment" | "3 Months" | "6 Months" | "9 Months" | "12 Months";
  amtPaid: number;
  grandTotal: number;
  netTotal: number | null;
  discount: number | null;
  depositTarget: number | null;
  stage: Stage;
  notes: string | null;
  leadSource: string | null;
  address: string | null;
  priority: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  tags: string | null;
  siteVisit: string | null;
  docStage: string | null;
  version: number | null;
}

const LEAD_COLUMNS =
  "id,agent_key,name,contact,date_added,plot_type,no_plots,unit_price,payment_plan,amt_paid,grand_total,net_total,discount,deposit_target,stage,notes,lead_source,address,priority,next_action,next_action_date,tags,site_visit,doc_stage,version";

function mapLeadDetailRow(r: Record<string, unknown>): LeadDetail {
  return {
    id: r.id as string,
    agentKey: r.agent_key as string,
    name: r.name as string,
    contact: (r.contact as string | null | undefined) ?? "",
    date: r.date_added as string,
    plotType: (r.plot_type as PlotType | null | undefined) ?? "Full Plot",
    noPlots: Number((r.no_plots as number | null | undefined) ?? 1),
    unitPrice: Number((r.unit_price as number | null | undefined) ?? 0),
    paymentPlan: (r.payment_plan as LeadDetail["paymentPlan"] | null | undefined) ?? "Full Payment",
    amtPaid: Number((r.amt_paid as number | null | undefined) ?? 0),
    grandTotal: Number((r.grand_total as number | null | undefined) ?? 0),
    netTotal: r.net_total != null ? Number(r.net_total as number) : null,
    discount: r.discount != null ? Number(r.discount as number) : null,
    depositTarget: r.deposit_target != null ? Number(r.deposit_target as number) : null,
    stage: (r.stage as Stage | null | undefined) ?? "1",
    notes: (r.notes as string | null | undefined) ?? null,
    leadSource: (r.lead_source as string | null | undefined) ?? null,
    address: (r.address as string | null | undefined) ?? null,
    priority: (r.priority as string | null | undefined) ?? null,
    nextAction: (r.next_action as string | null | undefined) ?? null,
    nextActionDate: (r.next_action_date as string | null | undefined) ?? null,
    tags: (r.tags as string | null | undefined) ?? null,
    siteVisit: (r.site_visit as string | null | undefined) ?? null,
    docStage: (r.doc_stage as string | null | undefined) ?? null,
    version: (r.version as number | null | undefined) ?? null,
  };
}

function useViewAll(): boolean {
  const profile = useAuthStore((s) => s.profile);
  return !!profile && (profile.role === "manager" || ["elias", "emmanuel", "elizabeth"].includes(profile.key));
}

export function useLead(id: string) {
  const viewAll = useViewAll();
  const profile = useAuthStore((s) => s.profile);
  return useQuery({
    queryKey: ["lead", id, viewAll],
    enabled: !!id,
    queryFn: async () => {
      const client = requireSupabase();
      let query = client.from("leads").select(LEAD_COLUMNS).eq("id", id);
      if (!viewAll) query = query.eq("agent_key", profile?.key ?? "");
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data ? mapLeadDetailRow(data) : null;
    },
  });
}

export interface LeadPatch {
  name?: string;
  contact?: string;
  plotType?: PlotType;
  noPlots?: number;
  unitPrice?: number;
  discount?: number | null;
  netTotal?: number;
  grandTotal?: number;
  paymentPlan?: LeadDetail["paymentPlan"];
  stage?: Stage;
  nextAction?: string;
  nextActionDate?: string | null;
  notes?: string;
  tags?: string;
  siteVisit?: string;
  depositTarget?: number;
  priority?: string;
  leadSource?: string;
  address?: string;
  expectedVersion?: number | null;
}

function buildLeadDbPatch(patch: LeadPatch): Record<string, unknown> {
  const dbPatch: Record<string, unknown> = {};
  if ("name" in patch) dbPatch.name = patch.name;
  if ("contact" in patch) dbPatch.contact = patch.contact;
  if ("plotType" in patch) dbPatch.plot_type = patch.plotType;
  if ("noPlots" in patch) dbPatch.no_plots = patch.noPlots;
  if ("unitPrice" in patch) dbPatch.unit_price = patch.unitPrice;
  if ("discount" in patch) dbPatch.discount = patch.discount;
  if ("netTotal" in patch) dbPatch.net_total = patch.netTotal;
  if ("grandTotal" in patch) dbPatch.grand_total = patch.grandTotal;
  if ("paymentPlan" in patch) dbPatch.payment_plan = patch.paymentPlan;
  if ("stage" in patch) dbPatch.stage = patch.stage;
  if ("nextAction" in patch) dbPatch.next_action = patch.nextAction;
  if ("nextActionDate" in patch) dbPatch.next_action_date = patch.nextActionDate;
  if ("notes" in patch) dbPatch.notes = patch.notes;
  if ("tags" in patch) dbPatch.tags = patch.tags;
  if ("siteVisit" in patch) dbPatch.site_visit = patch.siteVisit;
  if ("depositTarget" in patch) dbPatch.deposit_target = patch.depositTarget;
  if ("priority" in patch) dbPatch.priority = patch.priority;
  if ("leadSource" in patch) dbPatch.lead_source = patch.leadSource;
  if ("address" in patch) dbPatch.address = patch.address;
  if ("grandTotal" in patch) dbPatch.balance = Math.max((patch.grandTotal ?? 0) - 0, 0);
  return dbPatch;
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LeadPatch }) => {
      const client = requireSupabase();
      const dbPatch = buildLeadDbPatch(patch);
      let query = client.from("leads").update(dbPatch).eq("id", id);
      if (patch.expectedVersion != null) query = query.eq("version", patch.expectedVersion);
      const { data, error } = await query.select(LEAD_COLUMNS).single();
      if (error) throw error;
      return mapLeadDetailRow(data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lead"] });
      void qc.invalidateQueries({ queryKey: ["pipelineLeads"] });
    },
  });
}

export function useAssignLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agentKey }: { id: string; agentKey: string }) => {
      const { error } = await requireSupabase().from("leads").update({ agent_key: agentKey }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lead"] });
      void qc.invalidateQueries({ queryKey: ["pipelineLeads"] });
    },
  });
}

export function useCanViewDocStage(): boolean {
  return useViewAll();
}

const DOC_STAGES = [
  { key: "allocation", label: "Allocation" },
  { key: "picking", label: "Picking" },
  { key: "site_plan", label: "Preparation of site plan" },
  { key: "indentures", label: "Preparation of indentures" },
  { key: "court_stamping", label: "Ready for court stamping" },
  { key: "ready_pickup", label: "Documents ready for pickup" },
] as const;

export { DOC_STAGES };

export function useUpdateLeadDocStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await requireSupabase().rpc("update_lead_doc_stage", { p_lead_id: id, p_stage: stage });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lead"] }),
  });
}

// Real SECURITY DEFINER RPC -- soft-deletes the lead AND vacates any
// plot(s) allocated via this lead's own allocation_request(s) back to
// Available, atomically. Honestly not ported: web-next's own DangerZoneSection
// ALSO does a client-side plot-vacate-by-name-match loop before calling this,
// to catch older rows whose plot.client_name text matches but that never had
// a formal allocation_request row -- a real but narrower legacy-data-cleanup
// edge case, deferred here.
export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      reason,
      deletedBy,
      deletedByName,
    }: {
      id: string;
      reason: string;
      deletedBy: string;
      deletedByName: string;
    }) => {
      const { error } = await requireSupabase().rpc("archive_lead_and_vacate", {
        p_lead_id: id,
        p_reason: reason,
        p_deleted_by: deletedBy,
        p_deleted_by_name: deletedByName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lead"] });
      void qc.invalidateQueries({ queryKey: ["pipelineLeads"] });
      void qc.invalidateQueries({ queryKey: ["plots"] });
    },
  });
}

export function useCanLogPayments(): boolean {
  const profile = useAuthStore((s) => s.profile);
  return !!profile && (profile.role === "manager" || profile.key === "elias");
}

export interface PaymentRow {
  id: string;
  leadId: string;
  amount: number;
  date: string;
  status: "approved" | "pending" | "declined" | "needs_correction";
}

export function usePaymentsForLead(leadId: string) {
  return useQuery({
    queryKey: ["paymentsForLead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("payments")
        .select("id,lead_id,amount,payment_date,status")
        .eq("lead_id", leadId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(
        (r): PaymentRow => ({
          id: r.id as string,
          leadId: r.lead_id as string,
          amount: Number(r.amount ?? 0),
          date: r.payment_date as string,
          status: (r.status as PaymentRow["status"] | null | undefined) ?? "approved",
        }),
      );
    },
  });
}

// Manager or Elias only, matching the real payments_ins RLS -- a manager
// self-approves (reflects on the balance immediately), Elias logs pending
// (awaiting Management approval elsewhere). Honestly not ported: the
// receipt-download/share-link actions on each history row (separate PDF
// feature, same discipline Allocations used to defer its own PDF).
export function useCreatePayment() {
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      leadName,
      agentKey,
      amount,
    }: {
      leadId: string;
      leadName: string;
      agentKey: string;
      amount: number;
    }) => {
      const client = requireSupabase();
      const status = profile?.role === "manager" ? "approved" : "pending";
      const { error: insError } = await client.from("payments").insert({
        lead_id: leadId,
        agent_key: agentKey,
        client_name: leadName,
        amount,
        payment_date: new Date().toISOString().slice(0, 10),
        status,
      });
      if (insError) throw insError;
      if (status === "approved") {
        const { data: leadRow, error: leadError } = await client
          .from("leads")
          .select("amt_paid,grand_total")
          .eq("id", leadId)
          .single();
        if (leadError) throw leadError;
        const newAmtPaid = Number(leadRow.amt_paid ?? 0) + amount;
        const grandTotal = Number(leadRow.grand_total ?? 0);
        const newBalance = Math.max(grandTotal - newAmtPaid, 0);
        const newStage = deriveStageFromPayment(newAmtPaid, grandTotal);
        const { error: updError } = await client
          .from("leads")
          .update({ amt_paid: newAmtPaid, balance: newBalance, stage: newStage })
          .eq("id", leadId);
        if (updError) throw updError;
      }
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["paymentsForLead", vars.leadId] });
      void qc.invalidateQueries({ queryKey: ["lead"] });
      void qc.invalidateQueries({ queryKey: ["pipelineLeads"] });
    },
  });
}

export function useStaffDirectory() {
  return useQuery({
    queryKey: ["staffDirectory"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("profiles").select("agent_key,name").order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({ key: r.agent_key as string, name: r.name as string }));
    },
  });
}
