"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ghs } from "@/lib/palmstead/format";
import { useManagerOverview } from "@/lib/palmstead/use-manager-overview";

// Real pipeline-by-stage funnel + real per-agent pipeline value --
// replaces the template's fake "18,426 Customers" recent-customers table
// (that table's underlying data.json/schema/columns files are unused now
// but left in place; nothing else references them).
const STAGE_LABELS: Record<string, string> = {
  "1": "New",
  "2A": "Site visit",
  "2B": "Reserved",
  "3": "Docs",
  "4": "Closed",
  Lost: "Lost",
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function SubscriberOverview() {
  const { data, isLoading } = useManagerOverview();
  const maxAgentValue = Math.max(1, ...(data?.byAgent.map((a) => a.value) ?? [1]));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="leading-none">Pipeline by stage</CardTitle>
          <CardDescription>Real lead count per pipeline stage, company-wide.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {data?.stageFunnel.map((s) => {
            const total = data.stageFunnel.reduce((sum, x) => sum + x.count, 0) || 1;
            const pct = Math.round((s.count / total) * 100);
            return (
              <div key={s.stage} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-muted-foreground text-sm">{STAGE_LABELS[s.stage] ?? s.stage}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right font-medium text-sm tabular-nums">{s.count}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="leading-none">By agent</CardTitle>
          <CardDescription>Real pipeline value per agent, ranked highest first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {data && data.byAgent.length === 0 && !isLoading && (
            <p className="text-muted-foreground text-sm">No leads yet.</p>
          )}
          {data?.byAgent.map((a) => (
            <div key={a.key} className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-xs">
                {initials(a.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{a.name}</span>
                  <span className="shrink-0 tabular-nums">{ghs(a.value)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, Math.round((a.value / maxAgentValue) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
