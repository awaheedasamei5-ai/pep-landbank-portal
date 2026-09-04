import type { Plot, PlotType } from '../../../types/domain';

// Master Spec 7.4's suggestion engine, built for real against whatever
// dimension data actually exists today -- most real plots have none yet
// (see PHASE0_INVENTORY.md's Allocation+Inventory section: the 415-plot
// Royal Palm appendix hasn't been reconciled/imported), so this must work
// sensibly on plots with widthFt/lengthFt null, not assume every row is
// fully measured. Steps followed, in order:
//   1. Determine units requested -- caller passes the real PlotType[]
//      already computed by allocationUnitsNeeded (Full/Half Plot per unit).
//   2. Search available inventory (status==='Available' only -- never an
//      already-allocated, disputed, or subdivided-parent plot), optionally
//      narrowed to one site.
//   3. Prefer an exact physical size match against the configured standard
//      dimensions for that plot type (Config.techFullPlotLengthFt/WidthFt,
//      techHalfPlotLengthFt/WidthFt -- the same reference the Technical
//      Quotation calculator already uses, not a new invented number).
//   4. A plot with real dimension data on file ranks above one without,
//      even if both are nominally the same plotType -- "prefer exact
//      match" only means something once there's something to match.
//   5. Multi-unit requests return ONE complete set (one candidate per
//      unit, never reusing a plot across units in the same set) --
//      "suggest a complete set, not unrelated alternatives" (7.4.6).
//      Single-unit requests return up to 3 ranked alternatives instead.

export interface StandardDimensions {
  fullWidthFt: number;
  fullLengthFt: number;
  halfWidthFt: number;
  halfLengthFt: number;
}

export interface PlotSuggestion {
  plot: Plot;
  reason: string;
}

function standardAreaFor(plotType: PlotType, std: StandardDimensions): number {
  return plotType === 'Half Plot' ? std.halfWidthFt * std.halfLengthFt : std.fullWidthFt * std.fullLengthFt;
}

function buildReason(plot: Plot, plotType: PlotType, std: StandardDimensions): string {
  const loc = plot.section ? `Section ${plot.section}, plot ${plot.plotNumber}` : `Plot ${plot.plotNumber}`;
  if (plot.widthFt != null && plot.lengthFt != null) {
    const isStandard = Math.abs((plot.areaSqft ?? 0) - standardAreaFor(plotType, std)) < 1;
    const sizeNote = isStandard ? 'standard size' : 'irregular size -- verify against the site plan';
    return `${loc} -- ${plot.widthFt}x${plot.lengthFt}ft (${plot.areaSqft ?? 0} sqft), ${sizeNote}, GHS ${plot.price ?? 0}.`;
  }
  return `${loc} -- no physical dimensions on file yet; confirm the real size before offering this one.`;
}

// Scored lowest-first: 0 = exact match to standard dimensions, higher =
// further off (or unknown, sorted last).
function scorePlot(plot: Plot, plotType: PlotType, std: StandardDimensions): number {
  if (plot.areaSqft == null) return Number.POSITIVE_INFINITY;
  return Math.abs(plot.areaSqft - standardAreaFor(plotType, std));
}

function candidatesFor(plots: Plot[], plotType: PlotType, site: string | undefined, exclude: Set<string>, std: StandardDimensions): PlotSuggestion[] {
  return plots
    .filter((p) => p.status === 'Available' && p.plotType === plotType && !exclude.has(p.id) && (!site || p.site === site))
    .sort((a, b) => scorePlot(a, plotType, std) - scorePlot(b, plotType, std) || a.plotNumber.localeCompare(b.plotNumber))
    .map((plot) => ({ plot, reason: buildReason(plot, plotType, std) }));
}

// Single-unit request -> up to 3 ranked alternatives (staff picks one).
export function suggestAlternatives(plots: Plot[], plotType: PlotType, std: StandardDimensions, site?: string): PlotSuggestion[] {
  return candidatesFor(plots, plotType, site, new Set(), std).slice(0, 3);
}

// Multi-unit request -> exactly one complete set, one candidate per unit,
// never reusing a plot. Returns null for a unit that has no available
// candidate at all -- callers must treat a null slot as "no suggestion
// possible," never silently drop the unit.
export function suggestSet(plots: Plot[], units: PlotType[], std: StandardDimensions, site?: string): (PlotSuggestion | null)[] {
  const used = new Set<string>();
  return units.map((unit) => {
    const best = candidatesFor(plots, unit, site, used, std)[0] ?? null;
    if (best) used.add(best.plot.id);
    return best;
  });
}
