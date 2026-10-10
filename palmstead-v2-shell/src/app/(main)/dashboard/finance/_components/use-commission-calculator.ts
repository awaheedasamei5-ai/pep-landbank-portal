"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Commission Calculator (Part B.9 -- docs/plans/05-accounting-app-blueprint.md).
// A manual what-if tool: Management enters payments, assigns each to a
// roster participant (reusing payroll_staff), and the calculator runs the
// exact same real formula already proven in get_commission_breakdown()
// (see useCommissionRates/computeCalculator in commission-calculator-panel.tsx)
// against this manually-entered data. Pool eligibility and "is this a new
// plot sale" are both manual flags here -- a manually-entered payment has
// no real lead/payment history for the automated 3-month rule to check.
export interface CalcSettings {
  fullCap: number;
  halfCap: number;
  fullPrice: number;
  halfPrice: number;
  poolPerPlot: number;
}

export interface CalcSession {
  id: string;
  period: string;
  name: string | null;
  createdAt: string;
  settings: CalcSettings;
}

export interface CalcEntry {
  id: string;
  sessionId: string;
  payrollStaffId: string;
  clientName: string;
  plotType: "Full Plot" | "Half Plot";
  amount: number;
  noPlots: number;
  isNewSale: boolean;
}

export interface CalcParticipant {
  id: string;
  sessionId: string;
  payrollStaffId: string;
  poolEligible: boolean;
}

export interface CommissionRates {
  fullCap: number;
  halfCap: number;
  poolPerPlot: number;
  fullPrice: number;
  halfPrice: number;
}

export function useCommissionRates() {
  return useQuery({
    queryKey: ["commission-calc-rates"],
    queryFn: async (): Promise<CommissionRates> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("app_config").select("commission_full_cap,commission_half_cap,commission_pool_per_plot,full_price,half_price").eq("id", 1).single();
      if (error) throw error;
      const row = data as { commission_full_cap: number | null; commission_half_cap: number | null; commission_pool_per_plot: number | null; full_price: number | null; half_price: number | null };
      return {
        fullCap: Number(row.commission_full_cap ?? 1000),
        halfCap: Number(row.commission_half_cap ?? 500),
        poolPerPlot: Number(row.commission_pool_per_plot ?? 500),
        fullPrice: Number(row.full_price ?? 0),
        halfPrice: Number(row.half_price ?? 0),
      };
    },
  });
}

type RawSession = {
  id: string;
  period: string;
  name: string | null;
  created_at: string;
  full_cap: number | null;
  half_cap: number | null;
  full_price: number | null;
  half_price: number | null;
  pool_per_plot: number | null;
};

function mapSession(r: RawSession): CalcSession {
  return {
    id: r.id,
    period: r.period,
    name: r.name,
    createdAt: r.created_at,
    settings: {
      fullCap: Number(r.full_cap ?? 1000),
      halfCap: Number(r.half_cap ?? 500),
      fullPrice: Number(r.full_price ?? 0),
      halfPrice: Number(r.half_price ?? 0),
      poolPerPlot: Number(r.pool_per_plot ?? 500),
    },
  };
}

export function useCalcSessions() {
  return useQuery({
    queryKey: ["commission-calc-sessions"],
    queryFn: async (): Promise<CalcSession[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("commission_calc_sessions")
        .select("id,period,name,created_at,full_cap,half_cap,full_price,half_price,pool_per_plot")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => mapSession(r as RawSession));
    },
  });
}

// Real settings are seeded from the live app_config rates at creation
// time (so a new session isn't blank), but stored on the session itself
// from then on -- a what-if tool needs to be able to override "what if
// the cap were different this month" without touching production rates.
export function useCreateCalcSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { period: string; name: string; createdBy: string | undefined }) => {
      const sb = requireSupabase();
      const { data: cfg, error: cfgError } = await sb.from("app_config").select("commission_full_cap,commission_half_cap,commission_pool_per_plot,full_price,half_price").eq("id", 1).single();
      if (cfgError) throw cfgError;
      const row = cfg as { commission_full_cap: number | null; commission_half_cap: number | null; commission_pool_per_plot: number | null; full_price: number | null; half_price: number | null };
      const { data, error } = await sb
        .from("commission_calc_sessions")
        .insert({
          period: input.period,
          name: input.name || null,
          created_by: input.createdBy ?? null,
          full_cap: row.commission_full_cap ?? 1000,
          half_cap: row.commission_half_cap ?? 500,
          full_price: row.full_price ?? 0,
          half_price: row.half_price ?? 0,
          pool_per_plot: row.commission_pool_per_plot ?? 500,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commission-calc-sessions"] }),
  });
}

export function useUpdateCalcSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; settings: CalcSettings }) => {
      const sb = requireSupabase();
      const { error } = await sb
        .from("commission_calc_sessions")
        .update({
          full_cap: input.settings.fullCap,
          half_cap: input.settings.halfCap,
          full_price: input.settings.fullPrice,
          half_price: input.settings.halfPrice,
          pool_per_plot: input.settings.poolPerPlot,
        })
        .eq("id", input.sessionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commission-calc-sessions"] }),
  });
}

export function useDeleteCalcSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("commission_calc_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commission-calc-sessions"] }),
  });
}

export function useCalcEntries(sessionId: string | null) {
  return useQuery({
    queryKey: ["commission-calc-entries", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<CalcEntry[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("commission_calc_entries")
        .select("id,session_id,payroll_staff_id,client_name,plot_type,amount,no_plots,is_new_sale")
        .eq("session_id", sessionId as string)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        payrollStaffId: r.payroll_staff_id,
        clientName: r.client_name,
        plotType: r.plot_type,
        amount: Number(r.amount),
        noPlots: Number(r.no_plots),
        isNewSale: r.is_new_sale,
      }));
    },
  });
}

export function useAddCalcEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; payrollStaffId: string; clientName: string; plotType: "Full Plot" | "Half Plot"; amount: number; noPlots: number; isNewSale: boolean }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("commission_calc_entries").insert({
        session_id: input.sessionId,
        payroll_staff_id: input.payrollStaffId,
        client_name: input.clientName,
        plot_type: input.plotType,
        amount: input.amount,
        no_plots: input.noPlots,
        is_new_sale: input.isNewSale,
      });
      if (error) throw error;
      // Make sure the assigned staff member is a real participant row too
      // (default not pool-eligible -- Management toggles that explicitly).
      await sb.from("commission_calc_participants").upsert({ session_id: input.sessionId, payroll_staff_id: input.payrollStaffId }, { onConflict: "session_id,payroll_staff_id", ignoreDuplicates: true });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["commission-calc-entries", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["commission-calc-participants", vars.sessionId] });
    },
  });
}

export function useDeleteCalcEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; sessionId: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("commission_calc_entries").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["commission-calc-entries", vars.sessionId] }),
  });
}

export function useCalcParticipants(sessionId: string | null) {
  return useQuery({
    queryKey: ["commission-calc-participants", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<CalcParticipant[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("commission_calc_participants").select("id,session_id,payroll_staff_id,pool_eligible").eq("session_id", sessionId as string);
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, sessionId: r.session_id, payrollStaffId: r.payroll_staff_id, poolEligible: r.pool_eligible }));
    },
  });
}

// Real staff-first step: select who's part of this month's calculation
// before entering any of their sales, matching the user's own explicit
// workflow ("first select a staff then we toggle a section called
// monthly collected...").
export function useAddParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; payrollStaffId: string }) => {
      const sb = requireSupabase();
      const { error } = await sb
        .from("commission_calc_participants")
        .upsert({ session_id: input.sessionId, payroll_staff_id: input.payrollStaffId }, { onConflict: "session_id,payroll_staff_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["commission-calc-participants", vars.sessionId] }),
  });
}

export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; sessionId: string; payrollStaffId: string }) => {
      const sb = requireSupabase();
      // Removing a participant also clears their entries -- an orphaned
      // entry (linked to a staff member no longer in the session) would
      // silently vanish from the UI but still count toward totals.
      const { error: entriesError } = await sb.from("commission_calc_entries").delete().eq("session_id", input.sessionId).eq("payroll_staff_id", input.payrollStaffId);
      if (entriesError) throw entriesError;
      const { error } = await sb.from("commission_calc_participants").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["commission-calc-participants", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["commission-calc-entries", vars.sessionId] });
    },
  });
}

export function useSetParticipantEligibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; payrollStaffId: string; poolEligible: boolean }) => {
      const sb = requireSupabase();
      const { error } = await sb
        .from("commission_calc_participants")
        .upsert({ session_id: input.sessionId, payroll_staff_id: input.payrollStaffId, pool_eligible: input.poolEligible }, { onConflict: "session_id,payroll_staff_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["commission-calc-participants", vars.sessionId] }),
  });
}
