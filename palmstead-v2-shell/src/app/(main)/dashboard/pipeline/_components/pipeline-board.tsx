"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { AlertTriangle, CircleCheck, Gauge, Plus, Search, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ghs } from "@/lib/palmstead/format";
import { computePipelineKpis, isLeadOverdue, STAGE_LABELS, STAGE_ORDER } from "@/lib/palmstead/pipeline-logic";
import { type Stage, usePipelineLeads } from "@/lib/palmstead/use-pipeline-leads";

import { PipelineImportExportCard } from "./pipeline-import-export-card";

// Master Pipeline -- real company-wide/own-scoped lead list, real KPI
// strip, real stage-tab + search filtering, real "+ Add lead" and
// click-a-row-to-open-the-lead (routes to the real lead detail page,
// _components/lead-detail.tsx), and a real canonical-workbook
// import/export (_components/pipeline-import-export-card.tsx). Direct
// port of the core of web-next's PipelineListScreen (same KPI
// definitions, same stage vocabulary/order). Honestly not yet ported: the
// 8-dimension filter panel and bulk row actions.
const STAGE_TONE: Record<Stage, string> = {
  "1": "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  "2A": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "2B": "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "3": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "4": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Lost: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export function PipelineBoard() {
  const router = useRouter();
  const { data: leads, isLoading } = usePipelineLeads();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<Stage | "">("");

  const filtered = useMemo(() => {
    let rows = leads ?? [];
    if (stage) rows = rows.filter((l) => l.stage === stage);
    const q = query.trim().toLowerCase();
    if (q)
      rows = rows.filter(
        (l) => l.name.toLowerCase().includes(q) || l.contact.includes(q) || l.agentName.toLowerCase().includes(q),
      );
    return rows;
  }, [leads, stage, query]);

  const kpis = computePipelineKpis(leads ?? []);
  const kpiCards = [
    { icon: Gauge, label: "Pipeline value", value: ghs(kpis.pipelineValue) },
    { icon: Wallet, label: "Collected", value: ghs(kpis.collected) },
    { icon: Wallet, label: "Outstanding", value: ghs(kpis.outstanding) },
    { icon: CircleCheck, label: "Fully paid", value: String(kpis.fullyPaid) },
    { icon: AlertTriangle, label: "High priority", value: String(kpis.highPriority) },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Master Pipeline</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? "Loading…" : `${leads?.length ?? 0} lead${(leads?.length ?? 0) === 1 ? "" : "s"} company-wide`}
          </p>
        </div>
        <Button type="button" onClick={() => router.push("/dashboard/pipeline/new")}>
          <Plus className="size-4" /> Add lead
        </Button>
      </div>

      <PipelineImportExportCard />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpiCards.map((c) => (
          <Card key={c.label}>
            <CardHeader>
              <CardTitle>
                <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                  <c.icon className="size-4" />
                </div>
              </CardTitle>
              <CardDescription>{c.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="font-medium text-2xl tabular-nums leading-none tracking-tight">
                {isLoading ? "…" : c.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="relative">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border bg-transparent pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Search by client, contact, or agent…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStage("")}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${stage === "" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              All
            </button>
            {STAGE_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStage((v) => (v === s ? "" : s))}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${stage === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Client</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Plot</TableHead>
                <TableHead className="text-right">Grand total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="pr-6">Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    {leads && leads.length === 0 ? "No leads yet." : "No leads match this search/filter."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((l) => {
                const overdue = isLeadOverdue(l);
                return (
                  <TableRow
                    key={l.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/pipeline/${l.id}`)}
                  >
                    <TableCell className="pl-6 font-medium">{l.name}</TableCell>
                    <TableCell className="text-muted-foreground">{l.agentName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.plotType}
                      {l.noPlots > 1 ? ` ×${l.noPlots}` : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{ghs(l.grandTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{ghs(l.amtPaid)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ghs(Math.max(l.grandTotal - l.amtPaid, 0))}
                    </TableCell>
                    <TableCell className={overdue ? "text-destructive" : "text-muted-foreground"}>
                      {l.nextAction || "—"}
                      {overdue ? " ⚠" : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STAGE_TONE[l.stage]}>
                        {STAGE_LABELS[l.stage]}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-muted-foreground">{l.priority || "Low"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
