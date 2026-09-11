"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Minimal real port of web-next's Config (src/data/mappers.ts mapConfigRow)
// -- only the fields the apps built so far actually need, not the full
// real shape (which also carries quotation/contract/theme settings not
// touched yet). Real table `app_config`, single row id=1.
export interface AppConfigSubset {
  allocationThresholdPct: number;
  techFullPlotWidthFt: number;
  techFullPlotLengthFt: number;
  techHalfPlotWidthFt: number;
  techHalfPlotLengthFt: number;
}

async function fetchAppConfig(): Promise<AppConfigSubset> {
  const { data, error } = await requireSupabase()
    .from("app_config")
    .select(
      "allocation_threshold_pct,tech_full_plot_width_ft,tech_full_plot_length_ft,tech_half_plot_width_ft,tech_half_plot_length_ft",
    )
    .eq("id", 1)
    .single();
  if (error) throw error;
  return {
    allocationThresholdPct: Number(data.allocation_threshold_pct ?? 30),
    techFullPlotWidthFt: Number(data.tech_full_plot_width_ft ?? 100),
    techFullPlotLengthFt: Number(data.tech_full_plot_length_ft ?? 70),
    techHalfPlotWidthFt: Number(data.tech_half_plot_width_ft ?? 70),
    techHalfPlotLengthFt: Number(data.tech_half_plot_length_ft ?? 50),
  };
}

export function useAppConfig() {
  return useQuery({ queryKey: ["appConfig"], queryFn: fetchAppConfig, staleTime: 5 * 60_000 });
}
