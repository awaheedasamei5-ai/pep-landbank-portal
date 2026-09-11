"use client";

import { useRouter } from "next/navigation";

import { ghs } from "@/lib/palmstead/format";
import {
  type BoardUnit,
  boardUnits,
  clusterByOwner,
  tileFractionLabel,
  tileVisualStatus,
} from "@/lib/palmstead/plot-board-logic";
import type { PlotRow } from "@/lib/palmstead/use-plots";

// Direct visual port of web-next's real PlotInventoryScreen tile board
// (status-colored tiles, corner fraction badge for Half/Partial Plots,
// green-outlined owner-adjacency clusters with the owner's name above)
// -- same colors/shapes the real screen uses (PlotInventoryScreen.module.css),
// translated from CSS-module tokens to this project's Tailwind palette.
// No fabricated plot geometry/map -- this is the same honest "status-
// colored tile grid grouped by section" the original screen settled on.
const TILE_CLASS: Record<string, string> = {
  Available:
    "bg-emerald-50 border-emerald-300 text-emerald-700 hover:border-emerald-500 dark:bg-emerald-500/10 dark:border-emerald-700 dark:text-emerald-300",
  RunningSearch:
    "bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-500 dark:bg-amber-500/10 dark:border-amber-700 dark:text-amber-300",
  Allocated:
    "bg-slate-900 border-slate-900 text-white hover:opacity-90 dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900",
  AllocatedSplit: "bg-gradient-to-br from-blue-700 to-sky-400 border-blue-700 text-white hover:opacity-90",
  AllocatedPartial: "bg-gradient-to-br from-indigo-700 to-blue-400 border-indigo-700 text-white hover:opacity-90",
  Subdivided: "bg-muted border-border text-muted-foreground hover:border-foreground/30",
  Reserved:
    "bg-sky-50 border-sky-300 text-sky-700 hover:opacity-90 dark:bg-sky-500/10 dark:border-sky-700 dark:text-sky-300",
  HeldforApproval:
    "bg-violet-50 border-violet-300 text-violet-700 hover:opacity-90 dark:bg-violet-500/10 dark:border-violet-700 dark:text-violet-300",
  Blocked:
    "bg-red-50 border-red-300 text-red-700 hover:opacity-90 dark:bg-red-500/10 dark:border-red-700 dark:text-red-300",
  Disputed: "bg-red-600 border-red-600 text-white hover:opacity-90",
  Archived: "bg-muted border-border text-muted-foreground/60 hover:border-foreground/20",
};

function PlotTile({ p, inSplit = false }: { p: PlotRow; inSplit?: boolean }) {
  const router = useRouter();
  const fraction = tileFractionLabel(p);
  const visual = tileVisualStatus(p, inSplit);
  const isDark =
    visual === "Allocated" || visual === "AllocatedSplit" || visual === "AllocatedPartial" || visual === "Disputed";
  return (
    <button
      type="button"
      title={`${p.plotNumber} · ${p.plotType} · ${p.status}${p.clientName ? ` · ${p.clientName}` : ""}`}
      onClick={() => router.push(`/dashboard/plots/${p.id}`)}
      className={`relative flex w-[76px] min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-lg border-[1.5px] p-1 transition-colors ${TILE_CLASS[visual] ?? TILE_CLASS.Subdivided}`}
    >
      {fraction && (
        <span
          className={`absolute top-0.5 right-0.5 rounded px-1 py-px font-mono font-bold text-[8px] leading-tight ${isDark ? "bg-white/20" : "bg-black/15"}`}
        >
          {fraction}
        </span>
      )}
      <span className="font-mono font-bold text-xs">{p.plotNumber}</span>
      {p.price != null && <span className="font-mono text-[9.5px] opacity-85">{ghs(p.price)}</span>}
    </button>
  );
}

export function PlotBoard({ plots }: { plots: PlotRow[] }) {
  const bySection = new Map<string, PlotRow[]>();
  for (const p of plots) {
    const key = p.section ?? "—";
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)?.push(p);
  }

  return (
    <div className="hidden flex-col gap-5 lg:flex">
      {[...bySection.entries()].map(([section, secPlots]) => (
        <div key={section}>
          <div className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Block {section}
          </div>
          <div className="flex flex-wrap items-start gap-2.5">
            {clusterByOwner(boardUnits(secPlots)).map((entry) => (
              <BoardUnitSlot key={entry.units[0].key} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardUnitSlot({ entry }: { entry: { cluster: boolean; units: BoardUnit[]; ownerLabel?: string } }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="block h-3 max-w-[220px] truncate font-semibold text-[10px] text-emerald-600 leading-3 dark:text-emerald-400">
        {entry.cluster ? entry.ownerLabel : " "}
      </span>
      <div
        className={`flex flex-wrap gap-2 rounded-xl border-2 p-1.5 ${entry.cluster ? "border-emerald-500" : "border-transparent"}`}
      >
        {entry.units.map((unit) => (
          <div key={unit.key} className={unit.tiles.length > 1 ? "flex gap-1" : undefined}>
            {unit.tiles.map((p) => (
              <PlotTile key={p.id} p={p} inSplit={unit.tiles.length > 1} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
