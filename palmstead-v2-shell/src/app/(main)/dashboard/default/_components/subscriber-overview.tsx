"use client";

import Link from "next/link";
import { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { ghs } from "@/lib/palmstead/format";
import { useManagerOverview } from "@/lib/palmstead/use-manager-overview";
import { useAuthStore } from "@/stores/auth/auth-store";

const stageNames: Record<string, string> = { "1": "New", "2A": "Site visit", "2B": "Reserved", "3": "Documents", "4": "Closed", Lost: "Lost" };
const colors = ["#f15b39", "#2563eb", "#0d9488", "#7c3aed", "#db2777", "#d97706", "#0891b2", "#65a30d", "#b45309", "#4f46e5"];
const config = { amount: { label: "Pipeline", color: "var(--chart-1)" } } satisfies ChartConfig;
function compactMoney(value: number): string {
  if (value >= 1_000_000) return `GHS ${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `GHS ${(value / 1_000).toFixed(0)}k`;
  return `GHS ${Math.round(value)}`;
}

export function SubscriberOverview() {
  const { data, isLoading } = useManagerOverview();
  const isManager = useAuthStore((s) => s.profile?.role === "manager");
  const [view, setView] = useState<"team" | "stages">("team");
  const mode = isManager ? view : "stages";
  const segments = mode === "team"
    ? (data?.byAgent ?? []).map((agent) => ({ key: agent.key, label: agent.key === "company" ? "Company leads" : agent.name, amount: agent.value }))
    : (data?.stageFunnel ?? []).map((stage) => ({ key: stage.stage, label: stageNames[stage.stage] ?? stage.stage, amount: stage.count }));
  const plotted = segments.filter((segment) => segment.amount > 0);
  const total = plotted.reduce((sum, segment) => sum + segment.amount, 0);

  return <Card className="min-w-0 overflow-hidden">
    <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1"><CardTitle>Pipeline at a glance</CardTitle><CardDescription>{mode === "team" ? "Share of pipeline value by person, including company leads." : "Share of leads at each stage."}</CardDescription></div>
      {isManager && <fieldset className="flex w-fit rounded-lg border bg-muted/50 p-1"><legend className="sr-only">Pipeline chart view</legend>
        <button type="button" onClick={() => setView("team")} aria-pressed={mode === "team"} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "team" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>By person</button>
        <button type="button" onClick={() => setView("stages")} aria-pressed={mode === "stages"} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "stages" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>By stage</button>
      </fieldset>}
    </CardHeader>
    <CardContent className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
      <div className="relative mx-auto w-full max-w-72">
        {isLoading ? <div className="flex aspect-square items-center justify-center text-sm text-muted-foreground">Loading pipeline…</div> : total === 0 ? <div className="flex aspect-square items-center justify-center rounded-full border border-dashed text-center text-sm text-muted-foreground">No pipeline data yet</div> : <ChartContainer config={config} className="aspect-square w-full">
          <PieChart key={mode} accessibilityLayer>
            <ChartTooltip cursor={false} content={({ active, payload }) => active && payload?.length ? <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"><p className="font-medium">{payload[0].payload.label}</p><p>{mode === "team" ? ghs(Number(payload[0].value ?? 0)) : `${payload[0].value} leads`}</p></div> : null} />
            <Pie data={plotted} dataKey="amount" nameKey="label" innerRadius="70%" outerRadius="94%" paddingAngle={plotted.length > 1 ? 2 : 0} stroke="none" isAnimationActive="auto" animationDuration={850}>
              {plotted.map((segment) => <Cell key={segment.key} fill={colors[segments.findIndex((item) => item.key === segment.key) % colors.length]} />)}
            </Pie>
          </PieChart>
        </ChartContainer>}
        {!isLoading && total > 0 && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground">Pipeline value</span>
          <strong className="text-lg font-semibold tabular-nums sm:text-xl">{compactMoney(data?.pipelineValue ?? 0)}</strong>
        </div>}
      </div>
      <div className="min-w-0 space-y-1.5">
      <ul aria-label={mode === "team" ? "Pipeline value by person" : "Leads by stage"}>
        {segments.map((segment, index) => <li key={segment.key} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm" title={segment.label}>{segment.label}</span>
          <span className="shrink-0 text-right text-xs font-medium tabular-nums">{mode === "team" ? ghs(segment.amount) : segment.amount}</span>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{total ? `${Math.round(segment.amount / total * 100)}%` : "0%"}</span>
        </li>)}
      </ul>
      <p className="px-2 text-xs text-muted-foreground">{data?.totalLeads ?? 0} leads · {mode === "team" ? "segments reflect value" : "segments reflect lead count"}</p>
      <Link href="/dashboard/pipeline" className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">Explore pipeline →</Link>
      </div>
    </CardContent>
  </Card>;
}

