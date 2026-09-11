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
  fullPrice: number;
  halfPrice: number;
  fullDiscount: number;
  halfDiscount: number;
  int3: number;
  int6: number;
  int9: number;
  int12: number;
}

async function fetchAppConfig(): Promise<AppConfigSubset> {
  const { data, error } = await requireSupabase()
    .from("app_config")
    .select(
      "allocation_threshold_pct,tech_full_plot_width_ft,tech_full_plot_length_ft,tech_half_plot_width_ft,tech_half_plot_length_ft,full_price,half_price,full_discount,half_discount,int_3,int_6,int_9,int_12",
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
    fullPrice: Number(data.full_price ?? 48000),
    halfPrice: Number(data.half_price ?? 24000),
    fullDiscount: Number(data.full_discount ?? 0),
    halfDiscount: Number(data.half_discount ?? 0),
    int3: Number(data.int_3 ?? 750),
    int6: Number(data.int_6 ?? 1500),
    int9: Number(data.int_9 ?? 2250),
    int12: Number(data.int_12 ?? 3000),
  };
}

export function useAppConfig() {
  return useQuery({ queryKey: ["appConfig"], queryFn: fetchAppConfig, staleTime: 5 * 60_000 });
}
