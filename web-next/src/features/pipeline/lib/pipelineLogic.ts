import type { PlotType, Stage } from '../../../types/domain';

// Ports of index.html's stage constants/derivation (index.html:2541,
// 2846-2854, 17138-17139). Pricing here is deliberately simplified to
// unitPrice * noPlots -- the real app's interest/discount/deposit-target
// calc engine (computeLead(), index.html:2860+) is a large, separate
// feature deferred to a later phase; grandTotal below is not yet a full
// port of that engine.
export const STAGES: Stage[] = ['1', '2A', '2B', '3', '4', 'Lost'];

// Internal code -> staff-facing display code (reversed numbering, per the
// deliberate "pipeline stage display flip" business decision already
// shipped in index.html).
const DISPLAY_STAGE_CODE: Record<Stage, string> = { '1': '4', '2A': '3', '2B': '2B', '3': '2A', '4': '1', Lost: 'Lost' };

export function displayStageCode(s: Stage): string {
  return DISPLAY_STAGE_CODE[s] ?? s;
}

export function deriveStageFromPayment(paid: number, grand: number): Stage {
  if (!grand || grand <= 0) return '1';
  const pct = (paid / grand) * 100;
  if (pct >= 100) return '4';
  if (pct >= 70) return '3';
  if (pct >= 30) return '2B';
  if (pct > 0) return '2A';
  return '1';
}

export function computeGrandTotal(unitPrice: number, noPlots: number): number {
  return unitPrice * noPlots;
}

// Ported from index.html's allocationUnitsNeeded() (index.html:2660-2675) --
// breaks a lead's plotType+noPlots into the real physical units Allocations
// needs to hand over, e.g. 1.5 Full Plot -> ['Full Plot','Half Plot']. Uses
// the same full-plot-equivalence (1 for Full, 0.5 for Half) the pricing
// engine already uses, not a new invented concept.
export function allocationUnitsNeeded(plotType: PlotType, noPlots: number): PlotType[] {
  const eqPerUnit = plotType === 'Half Plot' ? 0.5 : 1;
  const eq = eqPerUnit * (noPlots || 1);
  const wholeCount = Math.floor(eq + 1e-9);
  const hasHalf = eq - wholeCount >= 0.5 - 1e-9;
  const units: PlotType[] = [];
  for (let i = 0; i < wholeCount; i++) units.push('Full Plot');
  if (hasHalf) units.push('Half Plot');
  return units.length ? units : ['Full Plot'];
}
