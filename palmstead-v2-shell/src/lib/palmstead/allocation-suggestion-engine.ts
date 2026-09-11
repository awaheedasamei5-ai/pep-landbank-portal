import type { PlotRow, PlotType } from "@/lib/palmstead/use-plots";

// Direct port of web-next's src/features/allocations/lib/suggestionEngine.ts
// -- same real ranking (exact standard-dimension match first, a plot with
// real measurements on file always ranks above one without), same real
// split-fallback rule (no Half Plot available -> suggest a splittable
// Available Full Plot instead), same "one complete set for multi-unit,
// up to 3 ranked alternatives for single-unit" shape.

export interface StandardDimensions {
  fullWidthFt: number;
  fullLengthFt: number;
  halfWidthFt: number;
  halfLengthFt: number;
}

export interface PlotSuggestion {
  plot: PlotRow;
  reason: string;
}

function standardAreaFor(plotType: PlotType, std: StandardDimensions): number {
  return plotType === "Half Plot" ? std.halfWidthFt * std.halfLengthFt : std.fullWidthFt * std.fullLengthFt;
}

function buildReason(plot: PlotRow, plotType: PlotType, std: StandardDimensions): string {
  const loc = plot.section ? `Section ${plot.section}, plot ${plot.plotNumber}` : `Plot ${plot.plotNumber}`;
  if (plot.widthFt != null && plot.lengthFt != null) {
    const isStandard = Math.abs((plot.areaSqft ?? 0) - standardAreaFor(plotType, std)) < 1;
    const sizeNote = isStandard ? "standard size" : "irregular size -- verify against the site plan";
    return `${loc} -- ${plot.widthFt}x${plot.lengthFt}ft (${plot.areaSqft ?? 0} sqft), ${sizeNote}, GHS ${plot.price ?? 0}.`;
  }
  return `${loc} -- no physical dimensions on file yet; confirm the real size before offering this one.`;
}

function scorePlot(plot: PlotRow, plotType: PlotType, std: StandardDimensions): number {
  if (plot.areaSqft == null) return Number.POSITIVE_INFINITY;
  return Math.abs(plot.areaSqft - standardAreaFor(plotType, std));
}

function candidatesFor(
  plots: PlotRow[],
  plotType: PlotType,
  site: string | undefined,
  exclude: Set<string>,
  std: StandardDimensions,
): PlotSuggestion[] {
  return plots
    .filter(
      (p) => p.status === "Available" && p.plotType === plotType && !exclude.has(p.id) && (!site || p.site === site),
    )
    .sort(
      (a, b) => scorePlot(a, plotType, std) - scorePlot(b, plotType, std) || a.plotNumber.localeCompare(b.plotNumber),
    )
    .map((plot) => ({ plot, reason: buildReason(plot, plotType, std) }));
}

function splitFallbackCandidatesFor(
  plots: PlotRow[],
  site: string | undefined,
  exclude: Set<string>,
): PlotSuggestion[] {
  return plots
    .filter(
      (p) =>
        p.status === "Available" &&
        p.plotType === "Full Plot" &&
        !p.parentPlotId &&
        !exclude.has(p.id) &&
        (!site || p.site === site),
    )
    .sort((a, b) => a.plotNumber.localeCompare(b.plotNumber))
    .map((plot) => ({
      plot,
      reason: `No Half Plot currently Available -- ${plot.plotNumber} is a splittable Full Plot (${plot.widthFt ?? "?"}x${plot.lengthFt ?? "?"}ft, GHS ${plot.price ?? 0}). Split it into two halves to fulfill this unit.`,
    }));
}

function candidatesForUnit(
  plots: PlotRow[],
  plotType: PlotType,
  site: string | undefined,
  exclude: Set<string>,
  std: StandardDimensions,
): PlotSuggestion[] {
  const direct = candidatesFor(plots, plotType, site, exclude, std);
  if (direct.length > 0 || plotType !== "Half Plot") return direct;
  return splitFallbackCandidatesFor(plots, site, exclude);
}

export function suggestAlternatives(
  plots: PlotRow[],
  plotType: PlotType,
  std: StandardDimensions,
  site?: string,
): PlotSuggestion[] {
  return candidatesForUnit(plots, plotType, site, new Set(), std).slice(0, 3);
}

export function suggestSet(
  plots: PlotRow[],
  units: PlotType[],
  std: StandardDimensions,
  site?: string,
): (PlotSuggestion | null)[] {
  const used = new Set<string>();
  return units.map((unit) => {
    const best = candidatesForUnit(plots, unit, site, used, std)[0] ?? null;
    if (best) used.add(best.plot.id);
    return best;
  });
}

// Direct port of allocationUnitsNeeded (pipelineLogic.ts).
export function allocationUnitsNeeded(noPlots: number): PlotType[] {
  const eq = noPlots || 1;
  const wholeCount = Math.floor(eq + 1e-9);
  const hasHalf = eq - wholeCount >= 0.5 - 1e-9;
  const units: PlotType[] = [];
  for (let i = 0; i < wholeCount; i++) units.push("Full Plot");
  if (hasHalf) units.push("Half Plot");
  return units.length ? units : ["Full Plot"];
}
