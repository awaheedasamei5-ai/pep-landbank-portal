"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real port of web-next's Plot type/mapPlotRow (src/types/domain.ts,
// src/data/mappers.ts) -- the real plots.status vocabulary (9 values,
// schema migration applied 2026-09-04) is the exact one here, not a
// simplified guess. Full field set (not just the phase-1 subset this
// hook originally had) so the real tile-board/owner-clustering/split-
// pair logic ported from PlotInventoryScreen.tsx has everything it
// needs.
export type PlotStatus =
  | "Available"
  | "Running Search"
  | "Allocated"
  | "Subdivided"
  | "Reserved"
  | "Held for Approval"
  | "Blocked"
  | "Disputed"
  | "Archived";
export type PlotType = "Full Plot" | "Half Plot" | "Partial Plot";

export interface PlotRow {
  id: string;
  site: string;
  section: string | null;
  plotNumber: string;
  plotType: PlotType;
  status: PlotStatus;
  price: number | null;
  clientName: string | null;
  clientContact: string | null;
  agentKey: string | null;
  notes: string | null;
  parentPlotId: string | null;
  widthFt: number | null;
  lengthFt: number | null;
  areaSqft: number | null;
  factor: number | null;
  customerCode: string | null;
}

async function fetchPlots(): Promise<PlotRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("plots")
    .select(
      "id,site,section,plot_number,plot_type,status,price,client_name,client_contact,agent_key,notes,parent_plot_id,width_ft,length_ft,area_sqft,factor,customer_code",
    )
    .order("plot_number");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    site: r.site as string,
    section: (r.section as string | null | undefined) ?? null,
    plotNumber: r.plot_number as string,
    plotType: (r.plot_type as PlotType | null | undefined) ?? "Full Plot",
    status: (r.status as PlotStatus | null | undefined) ?? "Available",
    price: r.price == null ? null : Number(r.price as number),
    clientName: (r.client_name as string | null | undefined) ?? null,
    clientContact: (r.client_contact as string | null | undefined) ?? null,
    agentKey: (r.agent_key as string | null | undefined) ?? null,
    notes: (r.notes as string | null | undefined) ?? null,
    parentPlotId: (r.parent_plot_id as string | null | undefined) ?? null,
    widthFt: r.width_ft == null ? null : Number(r.width_ft as number),
    lengthFt: r.length_ft == null ? null : Number(r.length_ft as number),
    areaSqft: r.area_sqft == null ? null : Number(r.area_sqft as number),
    factor: r.factor == null ? null : Number(r.factor as number),
    customerCode: (r.customer_code as string | null | undefined) ?? null,
  }));
}

export function usePlots() {
  return useQuery({ queryKey: ["plots"], queryFn: fetchPlots });
}

export interface NewPlot {
  site: string;
  plotNumber: string;
  plotType: PlotType;
  status: PlotStatus;
  price?: number | null;
  section?: string | null;
  widthFt?: number | null;
  lengthFt?: number | null;
}

export interface PlotPatch {
  status?: PlotStatus;
  plotType?: PlotType;
  price?: number | null;
  clientName?: string | null;
  clientContact?: string | null;
  agentKey?: string | null;
  notes?: string | null;
  section?: string | null;
  widthFt?: number | null;
  lengthFt?: number | null;
}

function buildPlotDbPatch(patch: PlotPatch): Record<string, unknown> {
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("status" in patch) dbPatch.status = patch.status;
  if ("plotType" in patch) dbPatch.plot_type = patch.plotType;
  if ("price" in patch) dbPatch.price = patch.price;
  if ("clientName" in patch) dbPatch.client_name = patch.clientName;
  if ("clientContact" in patch) dbPatch.client_contact = patch.clientContact;
  if ("agentKey" in patch) dbPatch.agent_key = patch.agentKey;
  if ("notes" in patch) dbPatch.notes = patch.notes;
  if ("section" in patch) dbPatch.section = patch.section;
  if ("widthFt" in patch) dbPatch.width_ft = patch.widthFt;
  if ("lengthFt" in patch) dbPatch.length_ft = patch.lengthFt;
  return dbPatch;
}

// Real write capability (plots_ins/plots_upd/plots_del RLS, manager/
// elias/emmanuel only -- same gate usePlots() itself already enforces at
// the query level) plus the real split_plot_for_half_sale RPC. Direct
// port of web-next's usePlots.ts mutations.
export function useCreatePlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewPlot) => {
      const { error } = await requireSupabase()
        .from("plots")
        .insert({
          site: input.site,
          plot_number: input.plotNumber,
          plot_type: input.plotType,
          status: input.status,
          price: input.price ?? null,
          section: input.section ?? null,
          width_ft: input.widthFt ?? null,
          length_ft: input.lengthFt ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["plots"] }),
  });
}

export function useUpdatePlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PlotPatch }) => {
      const { error } = await requireSupabase().from("plots").update(buildPlotDbPatch(patch)).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["plots"] }),
  });
}

// Real hard DELETE (matches web-next/production exactly -- plots has no
// soft-delete column) -- irreversible, gated by the same "type to
// confirm" style danger-zone UI as everywhere else destructive in this
// shell.
export function useDeletePlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().from("plots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["plots"] }),
  });
}

export function useSplitPlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plotId: string) => {
      const { error } = await requireSupabase().rpc("split_plot_for_half_sale", { p_plot_id: plotId });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["plots"] }),
  });
}
