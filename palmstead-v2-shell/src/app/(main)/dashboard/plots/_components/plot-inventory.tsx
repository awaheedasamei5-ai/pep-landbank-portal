"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { Map as MapIcon, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ghs } from "@/lib/palmstead/format";
import { boardUnits } from "@/lib/palmstead/plot-board-logic";
import { type PlotRow, type PlotStatus, usePlots } from "@/lib/palmstead/use-plots";
import { useAuthStore } from "@/stores/auth/auth-store";

import { AddPlotForm } from "./add-plot-form";
import { PlotBoard } from "./plot-board";

// Plot Inventory -- real plot data, real status summary, the real
// status-colored tile board (ported into ./plot-board.tsx from
// web-next's PlotInventoryScreen, per the user's explicit direction to
// use that version rather than a simplified table). Real manager/elias/
// emmanuel write-access gate (plots_ins/plots_upd/plots_del RLS). Real
// "+ Add plot" toggle form and click-a-tile-to-open-the-real-detail-page
// (routes to _components/plot-detail.tsx).
const STATUS_BADGE: Record<PlotStatus, string> = {
  Available: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "Running Search": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  Allocated: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
  Subdivided: "bg-muted text-muted-foreground",
  Reserved: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "Held for Approval": "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  Blocked: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  Disputed: "bg-red-600 text-white",
  Archived: "bg-muted text-muted-foreground/60",
};
const LEGEND: { label: string; dot: string }[] = [
  { label: "Available", dot: "bg-emerald-500" },
  { label: "Running Search", dot: "bg-amber-500" },
  { label: "Allocated", dot: "bg-slate-900 dark:bg-slate-100" },
  { label: "Subdivided", dot: "bg-muted-foreground/40" },
  { label: "Reserved", dot: "bg-sky-500" },
  { label: "Held for Approval", dot: "bg-violet-500" },
  { label: "Blocked", dot: "bg-red-400" },
  { label: "Disputed", dot: "bg-red-600" },
  { label: "Archived", dot: "bg-muted-foreground/25" },
  { label: "Allocated · split", dot: "bg-gradient-to-br from-blue-700 to-sky-400" },
  { label: "Allocated · partial", dot: "bg-gradient-to-br from-indigo-700 to-blue-400" },
];
const STATUSES: PlotStatus[] = [
  "Available",
  "Running Search",
  "Allocated",
  "Subdivided",
  "Reserved",
  "Held for Approval",
  "Blocked",
  "Disputed",
  "Archived",
];

export function PlotInventory() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const hasAccess = !!profile && (profile.role === "manager" || profile.key === "elias" || profile.key === "emmanuel");
  const { data: plots, isLoading } = usePlots();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PlotStatus | "">("");
  const [section, setSection] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const sections = useMemo(
    () => Array.from(new Set((plots ?? []).map((p) => p.section).filter((s): s is string => !!s))).sort(),
    [plots],
  );

  const filtered = useMemo(() => {
    let rows = plots ?? [];
    if (status) rows = rows.filter((p) => p.status === status);
    if (section) rows = rows.filter((p) => p.section === section);
    const q = query.trim().toLowerCase();
    if (q)
      rows = rows.filter(
        (p) => p.plotNumber.toLowerCase().includes(q) || (p.clientName ?? "").toLowerCase().includes(q),
      );
    return rows;
  }, [plots, status, section, query]);

  const counts = useMemo(() => {
    const c: Record<PlotStatus, number> = {
      Available: 0,
      "Running Search": 0,
      Allocated: 0,
      Subdivided: 0,
      Reserved: 0,
      "Held for Approval": 0,
      Blocked: 0,
      Disputed: 0,
      Archived: 0,
    };
    for (const p of plots ?? []) c[p.status]++;
    return c;
  }, [plots]);
  const availableValue = (plots ?? []).filter((p) => p.status === "Available").reduce((s, p) => s + (p.price ?? 0), 0);

  const bySite = useMemo(() => {
    const map = new Map<string, PlotRow[]>();
    for (const p of filtered) {
      if (!map.has(p.site)) map.set(p.site, []);
      map.get(p.site)?.push(p);
    }
    return map;
  }, [filtered]);

  if (!hasAccess) {
    return (
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Plot Inventory</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          You don&apos;t have access to plot records. Ask a manager if you need this.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Plot Inventory</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? "Loading…" : `${plots?.length ?? 0} plots on record`}
          </p>
        </div>
        <Button type="button" onClick={() => setAddOpen((v) => !v)}>
          <Plus className="size-4" /> Add plot
        </Button>
      </div>

      {addOpen && (
        <AddPlotForm defaultSite={plots?.[0]?.site ?? "Royal Palm Enclave, Tsopoli"} onDone={() => setAddOpen(false)} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Available</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-medium text-2xl tabular-nums leading-none tracking-tight">
              {isLoading ? "…" : counts.Available}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Running search</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-medium text-2xl tabular-nums leading-none tracking-tight">
              {isLoading ? "…" : counts["Running Search"]}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Allocated</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-medium text-2xl tabular-nums leading-none tracking-tight">
              {isLoading ? "…" : counts.Allocated}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Available inventory value</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-medium text-2xl tabular-nums leading-none tracking-tight">
              {isLoading ? "…" : ghs(availableValue)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                <span className={`size-2 shrink-0 rounded-full ${l.dot}`} />
                {l.label}
              </span>
            ))}
          </div>

          {sections.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSection("")}
                className={`rounded-full border px-3 py-1 font-medium text-xs transition-colors ${section === "" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                All blocks
              </button>
              {sections.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSection((v) => (v === s ? "" : s))}
                  className={`rounded-full border px-3 py-1 font-medium text-xs transition-colors ${section === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                >
                  Block {s}
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border bg-transparent pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Search plot number or client…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStatus("")}
              className={`rounded-full border px-3 py-1 font-medium text-xs transition-colors ${status === "" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              All statuses
            </button>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus((v) => (v === s ? "" : s))}
                className={`rounded-full border px-3 py-1 font-medium text-xs transition-colors ${status === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {plots && plots.length === 0 ? "No plots added yet." : "No plots match this search/filter."}
            </p>
          )}

          {[...bySite.entries()].map(([site, sitePlots]) => (
            <div key={site}>
              <div className="mb-3 flex items-center gap-2 font-semibold text-sm">
                <MapIcon className="size-4 text-primary" />
                {site}
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-mono text-muted-foreground text-xs">
                  {sitePlots.length}
                </span>
              </div>
              <PlotBoard plots={sitePlots} />
              <div className="flex flex-col gap-2 lg:hidden">
                {boardUnits(sitePlots).map((unit) =>
                  unit.tiles.map((p, i) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => router.push(`/dashboard/plots/${p.id}`)}
                      className={`flex w-full items-center justify-between rounded-xl border bg-card p-3 text-left ${i > 0 ? "ml-5 border-l-2" : ""}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-sm">{p.plotNumber}</span>
                          {unit.tiles.length > 1 && <span className="text-[10px] text-muted-foreground">split</span>}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {p.plotType}
                          {p.widthFt != null && p.lengthFt != null ? ` · ${p.widthFt}x${p.lengthFt}ft` : ""}
                          {p.clientName ? ` · ${p.clientName}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        {p.price != null && <div className="font-mono text-sm">{ghs(p.price)}</div>}
                        <Badge variant="outline" className={`mt-1 ${STATUS_BADGE[p.status]}`}>
                          {p.status}
                        </Badge>
                      </div>
                    </button>
                  )),
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
