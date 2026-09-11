import type { PlotRow } from "@/lib/palmstead/use-plots";

// Direct port of the board-grouping logic from web-next's real
// PlotInventoryScreen.tsx (boardUnits/splitPairRoot/clusterByOwner/
// tileFractionLabel/tileVisualStatus) -- kept as pure functions here so
// the exact same real logic (natural plot-number order, split-parent/
// child grouping, historical split-pair detection, owner-adjacency
// clustering, fraction badges) drives the new tile board, not a
// simplified re-guess. See that file's own extensive comments for why
// each rule exists (real data-driven fixes, not aesthetic choices).

export function plotSeq(p: PlotRow): number | null {
  const m = p.plotNumber.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function naturalPlotSort(a: PlotRow, b: PlotRow): number {
  const sa = plotSeq(a);
  const sb = plotSeq(b);
  if (sa != null && sb != null && sa !== sb) return sa - sb;
  return a.plotNumber.localeCompare(b.plotNumber);
}

function splitPairRoot(p: PlotRow): string | null {
  if (p.plotType === "Full Plot") return null;
  const trimmed = p.plotNumber.trim();
  const m = trimmed.match(/^(.*?)\s*(?:[AB]|1\/2|2\/2)$/i);
  if (!m) return null;
  return `${p.section ?? ""}|${m[1].trim().toLowerCase()}`;
}

export interface BoardUnit {
  key: string;
  tiles: PlotRow[];
}

export function boardUnits(plots: PlotRow[]): BoardUnit[] {
  const parentIds = new Set(plots.map((p) => p.parentPlotId).filter((id): id is string => !!id));
  const map = new Map<string, PlotRow[]>();
  for (const p of plots) {
    if (parentIds.has(p.id)) continue;
    const key = p.parentPlotId ?? p.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(p);
  }
  const units = [...map.entries()]
    .map(([key, tiles]) => ({ key, tiles }))
    .sort((a, b) => naturalPlotSort(a.tiles[0], b.tiles[0]));

  const byRoot = new Map<string, BoardUnit[]>();
  for (const u of units) {
    if (u.tiles.length !== 1) continue;
    const root = splitPairRoot(u.tiles[0]);
    if (!root) continue;
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root)?.push(u);
  }
  const merged = new Set<string>();
  const result: BoardUnit[] = [];
  for (const u of units) {
    if (merged.has(u.key)) continue;
    const root = u.tiles.length === 1 ? splitPairRoot(u.tiles[0]) : null;
    const pair = root ? byRoot.get(root) : undefined;
    if (pair && pair.length === 2 && pair[0].key === u.key) {
      result.push({ key: root as string, tiles: [pair[0].tiles[0], pair[1].tiles[0]] });
      merged.add(pair[0].key);
      merged.add(pair[1].key);
    } else if (!merged.has(u.key)) {
      result.push(u);
    }
  }
  return result;
}

function ownerKeyFor(p: PlotRow): string | null {
  if (p.status !== "Allocated") return null;
  // biome-ignore lint/nursery/useNullishCoalescing: intentional -- an empty-string customerCode should also fall through to clientName, matching web-next's real original behavior.
  return p.customerCode || p.clientName || null;
}

export interface BoardEntry {
  cluster: boolean;
  units: BoardUnit[];
  ownerLabel?: string;
}

export function clusterByOwner(units: BoardUnit[]): BoardEntry[] {
  const result: BoardEntry[] = [];
  let i = 0;
  while (i < units.length) {
    const u = units[i];
    const owner = u.tiles.length === 1 ? ownerKeyFor(u.tiles[0]) : null;
    if (!owner) {
      result.push({ cluster: false, units: [u] });
      i++;
      continue;
    }
    const run = [u];
    let j = i + 1;
    while (j < units.length) {
      const nu = units[j];
      const nOwner = nu.tiles.length === 1 ? ownerKeyFor(nu.tiles[0]) : null;
      if (nOwner !== owner) break;
      const prevSeq = plotSeq(run[run.length - 1].tiles[0]);
      const curSeq = plotSeq(nu.tiles[0]);
      if (prevSeq == null || curSeq == null || curSeq - prevSeq > 2) break;
      run.push(nu);
      j++;
    }
    if (run.length >= 2) {
      result.push({ cluster: true, units: run, ownerLabel: run[0].tiles[0].clientName ?? owner });
      i = j;
    } else {
      result.push({ cluster: false, units: [u] });
      i++;
    }
  }
  return result;
}

export function tileFractionLabel(p: PlotRow): string | null {
  if (p.plotType === "Full Plot") return null;
  if (p.areaSqft != null) {
    const pct = Math.round((p.areaSqft / 7000) * 100);
    if (pct < 100) return `${pct}%`;
  } else if (p.factor != null && p.factor < 1) {
    return `${Math.round(p.factor * 100)}%`;
  }
  return p.plotType === "Half Plot" ? "½" : null;
}

export function tileVisualStatus(p: PlotRow, inSplit: boolean): string {
  if (p.status === "Allocated") {
    if (inSplit) return "AllocatedSplit";
    if (p.plotType === "Partial Plot") return "AllocatedPartial";
  }
  return p.status.replace(/\s/g, "");
}
