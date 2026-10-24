"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PageHeader } from "@/components/page-header";
import { ghs } from "../../../shared/lib/format";
import { useCompanyLeadsAnalytics } from "../hooks/useCompanyLeadsAnalytics";
import { AnalyticsKpiStrip, type KpiStripItem } from "../../analytics/screens/AnalyticsKpiStrip";
import styles from "./CallLogScreen.module.css";

const STAGE_LABELS: Record<string, string> = { "1": "New", "2A": "Discovery", "2B": "Qualified", "3": "Negotiation", "4": "Closed-Won", Lost: "Lost" };
const SOURCE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const callsConfig = { calls: { label: "Calls", color: "var(--chart-1)" } } satisfies ChartConfig;
const cashConfig = { cash: { label: "Collected", color: "var(--chart-2)" } } satisfies ChartConfig;
const stageConfig = { count: { label: "Leads", color: "var(--chart-1)" } } satisfies ChartConfig;

// docs/plans/28-company-leads-engagement-upgrade-plan.md Phase 3 -- real
// Company-Leads-scoped analytics, reusing the general Analytics app's
// own KPI-strip component rather than a second hand-rolled one.
export function CompanyLeadsAnalyticsScreen() {
  const { isLoading, metrics, monthLabels } = useCompanyLeadsAnalytics();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const items: KpiStripItem[] = [
    { key: "total", label: "Company Leads", value: String(metrics.totalLeads), deltaPct: null },
    { key: "calls", label: "Calls logged today", value: String(metrics.callsToday), deltaPct: null },
    { key: "visited", label: "Visited clients", value: String(metrics.visitedCount), deltaPct: null },
    { key: "cash", label: "Collected this month", value: ghs(metrics.cashThisMonth), deltaPct: null },
  ];

  const callsData = monthLabels.map((label, i) => ({ month: label, calls: metrics.callsByMonth[i] ?? 0 }));
  const cashData = monthLabels.map((label, i) => ({ month: label, cash: metrics.cashByMonth[i] ?? 0 }));
  const stageData = metrics.byStage.map((s) => ({ stage: STAGE_LABELS[s.stage] ?? s.stage, count: s.count }));

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/company-leads">
          <ArrowLeft />
          Company Leads
        </Link>
      </Button>
      <PageHeader title="Company Leads Analytics" description="Calls, sources, funnel, visits and cash — scoped to Company Leads clients only." />

      <div className="mb-4">
        <AnalyticsKpiStrip items={items} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={styles.section} style={{ "--stagger-index": 0 } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="font-normal">Calls logged</CardTitle>
            <CardDescription>last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={callsConfig} className="aspect-auto h-56 w-full">
              <LineChart data={callsData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.5} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent className="w-36" />} />
                <Line dataKey="calls" type="monotone" stroke="var(--color-calls)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className={styles.section} style={{ "--stagger-index": 1 } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="font-normal">Cash receipts</CardTitle>
            <CardDescription>last 6 months, approved payments</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={cashConfig} className="aspect-auto h-56 w-full">
              <LineChart data={cashData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.5} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent className="w-40" formatter={(value) => ghs(value as number)} />} />
                <Line dataKey="cash" type="monotone" stroke="var(--color-cash)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className={styles.section} style={{ "--stagger-index": 2 } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="font-normal">Funnel by stage</CardTitle>
            <CardDescription>{metrics.totalLeads} Company Leads</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={stageConfig} className="aspect-auto h-56 w-full">
              <BarChart data={stageData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.5} />
                <XAxis dataKey="stage" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent className="w-36" />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className={styles.section} style={{ "--stagger-index": 3 } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="font-normal">Visits vs purchases</CardTitle>
            <CardDescription>{metrics.visitedCount} distinct visited clients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Visited &amp; purchased</span>
              <span className="font-mono font-bold">{metrics.purchasedAmongVisited}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Visited, not yet purchased</span>
              <span className="font-mono font-bold">{metrics.visitedNotPurchased}</span>
            </div>
            <div className="mt-4 border-t pt-3">
              <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Leads by source</div>
              {metrics.bySource.map((s, i) => (
                <div key={s.source} className="flex items-center gap-2 py-1">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                  <span className="flex-1 truncate text-sm">{s.source}</span>
                  <span className="font-mono text-sm font-bold">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
