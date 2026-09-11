"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

// Real port of web-next's allocationRequests data-source methods
// (src/data/source.ts) -- same real table/RPCs (confirm_allocation,
// revert_allocation, delete_allocation all SECURITY DEFINER, syncing the
// real `plots` row atomically). RLS (alloc_sel/alloc_upd) already scopes
// list() correctly per session, same as leads/plots elsewhere in this
// shell -- no client-side manager/agent branch needed.
export type AllocationStatus = "Pending" | "Awaiting Authorization" | "Allocated";

export interface AllocationRequestRow {
  id: string;
  leadId: string;
  clientName: string;
  agentKey: string;
  agentName: string | null;
  percentPaid: number | null;
  grandTotal: number | null;
  amtPaid: number | null;
  status: AllocationStatus;
  plotNumber: string | null;
  suggestedPlots: string | null;
  flagReason: string | null;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): AllocationRequestRow {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    clientName: r.client_name as string,
    agentKey: r.agent_key as string,
    agentName: (r.agent_name as string | null | undefined) ?? null,
    percentPaid: r.percent_paid != null ? Number(r.percent_paid as number) : null,
    grandTotal: r.grand_total != null ? Number(r.grand_total as number) : null,
    amtPaid: r.amt_paid != null ? Number(r.amt_paid as number) : null,
    status: (r.status as AllocationStatus | null | undefined) ?? "Pending",
    plotNumber: (r.plot_number as string | null | undefined) ?? null,
    suggestedPlots: (r.suggested_plots as string | null | undefined) ?? null,
    flagReason: (r.flag_reason as string | null | undefined) ?? null,
    createdAt: r.created_at as string,
  };
}

export function useCanAllocatePlots(): boolean {
  const profile = useAuthStore((s) => s.profile);
  return !!profile && (profile.role === "manager" || ["elias", "emmanuel"].includes(profile.key));
}

export function useAllocationRequests() {
  return useQuery({
    queryKey: ["allocationRequests"],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("allocation_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export function useCreateAllocationRequest() {
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      const client = requireSupabase();
      const agentKey = profile?.key ?? "";
      const { data: leadRow, error: leadError } = await client
        .from("leads")
        .select("name,grand_total,amt_paid")
        .eq("id", leadId)
        .eq("agent_key", agentKey)
        .single();
      if (leadError) throw leadError;
      const grandTotal = Number(leadRow.grand_total ?? 0);
      const amtPaid = Number(leadRow.amt_paid ?? 0);
      const { data, error } = await client
        .from("allocation_requests")
        .insert({
          lead_id: leadId,
          client_name: leadRow.name,
          agent_key: agentKey,
          agent_name: profile?.name ?? "",
          percent_paid: grandTotal > 0 ? Math.round((amtPaid / grandTotal) * 1000) / 10 : null,
          grand_total: grandTotal,
          amt_paid: amtPaid,
          status: "Pending",
          agent_seen: true,
        })
        .select()
        .single();
      if (error) throw error;
      return mapRow(data);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["allocationRequests"] }),
  });
}

export function useSuggestAllocationPlots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, plotNumbers }: { id: string; plotNumbers: string[] }) => {
      const { data, error } = await requireSupabase()
        .from("allocation_requests")
        .update({ status: "Awaiting Authorization", suggested_plots: plotNumbers.join(",") })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapRow(data);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["allocationRequests"] }),
  });
}

export function useConfirmAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, plotNumber, note }: { id: string; plotNumber: string; note?: string }) => {
      const client = requireSupabase();
      const { error } = await client.rpc("confirm_allocation", {
        p_allocation_id: id,
        p_plot_number: plotNumber,
        p_note: note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["allocationRequests"] });
      void qc.invalidateQueries({ queryKey: ["plots"] });
    },
  });
}

export function useRevertAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().rpc("revert_allocation", { p_allocation_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["allocationRequests"] });
      void qc.invalidateQueries({ queryKey: ["plots"] });
    },
  });
}

export function useDeleteAllocationRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().rpc("delete_allocation", { p_allocation_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["allocationRequests"] });
      void qc.invalidateQueries({ queryKey: ["plots"] });
    },
  });
}

export function useSendBackAllocation() {
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await requireSupabase()
        .from("allocation_requests")
        .update({
          status: "Pending",
          suggested_plots: null,
          flag_reason: reason,
          flagged_by: profile?.name ?? "",
          flagged_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapRow(data);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["allocationRequests"] }),
  });
}
