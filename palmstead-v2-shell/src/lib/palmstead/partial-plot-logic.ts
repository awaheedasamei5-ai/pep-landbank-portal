import type { AppConfigSubset } from "@/lib/palmstead/use-app-config";

// Direct logic port of web-next's quotationLogic.ts (techBaseAreaSqft,
// techCustomLotArea) -- real irregular/partial-plot area math, shared by
// the Technical Quotation screen there and this shell's PartialPlotAdder.
export type TechLotShape = "rectangular" | "trapezoidal";

export interface TechLot {
  shape: TechLotShape;
  len: number | "";
  wid: number | "";
  a: number | "";
  b: number | "";
  h: number | "";
}

export function emptyTechLot(): TechLot {
  return { shape: "rectangular", len: "", wid: "", a: "", b: "", h: "" };
}

export function techBaseAreaSqft(config: AppConfigSubset): number {
  return config.techFullPlotLengthFt * config.techFullPlotWidthFt;
}

export function techCustomLotArea(lot: TechLot): number {
  if (!lot) return 0;
  if (lot.shape === "trapezoidal")
    return Math.max(0, (((Number(lot.a) || 0) + (Number(lot.b) || 0)) / 2) * (Number(lot.h) || 0));
  return Math.max(0, (Number(lot.len) || 0) * (Number(lot.wid) || 0));
}
