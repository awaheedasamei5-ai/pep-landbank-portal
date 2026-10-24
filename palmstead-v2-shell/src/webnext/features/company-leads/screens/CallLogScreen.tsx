"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/table-empty";
import { PageHeader } from "@/components/page-header";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useCompanyWideActivity } from "../hooks/useCallLog";
import { useCallLogTrends } from "../hooks/useCallLogTrends";
import { LogCallEntryButton } from "../components/LogCallEntryButton";
import { PeriodFilterBar } from "../components/PeriodFilterBar";
import { getOpenFollowUps, isToday } from "../lib/callLogLogic";
import styles from "./CallLogScreen.module.css";

const trendsChartConfig = { calls: { label: "Calls", color: "var(--chart-1)" } } satisfies ChartConfig;

type QuickFilter = "all" | "mine" | "followups";

function fmtDateTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

// docs/plans/28-company-leads-engagement-upgrade-plan.md Phase 1 -- the
// real company-wide Call Log, the one genuinely new page this upgrade
// adds. Every row is a real activity_log entry; "Log a call" writes a
// real one. Manager sees every company lead's calls, a staff member
// sees their own (real activity_log_sel RLS, unchanged).
export function CallLogScreen() {
  const profile = useSessionStore((s) => s.profile);
  const { data: entries, isLoading } = useCompanyWideActivity();
  const [filter, setFilter] = useState<QuickFilter>("all");
  const trends = useCallLogTrends();

  const all = entries ?? [];
  const openFollowUps = useMemo(() => getOpenFollowUps(all), [all]);
  const callsToday = all.filter((e) => isToday(e.createdAt)).length;
  const overdueCount = openFollowUps.filter((f) => f.overdue).length;

  const filtered = useMemo(() => {
    if (filter === "mine") return all.filter((e) => e.agentKey === profile?.key);
    if (filter === "followups") return [];
    return all;
  }, [all, filter, profile?.key]);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/company-leads">
          <ArrowLeft />
          Company Leads
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Call Log" description="Every real call, message and contact attempt logged for Company Leads clients." />
        <LogCallEntryButton />
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card className={styles.section} style={{ "--stagger-index": 0 } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardDescription>Calls logged today</CardDescription>
            <CardTitle className="text-2xl">{callsToday}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={styles.section} style={{ "--stagger-index": 1 } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardDescription>Open follow-ups</CardDescription>
            <CardTitle className="text-2xl">{openFollowUps.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={styles.section} style={{ "--stagger-index": 2 } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardDescription>Overdue follow-ups</CardDescription>
            <CardTitle className={`text-2xl ${overdueCount > 0 ? "text-destructive" : ""}`}>{overdueCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <section className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Trends</h2>
          <PeriodFilterBar filter={trends.filter} onChange={trends.setFilter} activityDates={trends.activityDates} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card className={styles.section}>
            <CardHeader className="pb-2">
              <CardTitle className="font-normal">Calls by {trends.filter.granularity}</CardTitle>
              <CardDescription>Site visits in this period: {trends.siteVisitsInPeriod}</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={trendsChartConfig} className="aspect-auto h-44 w-full">
                <BarChart data={trends.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.5} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} interval={trends.chartData.length > 20 ? 2 : 0} />
                  <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent className="w-32" />} />
                  <Bar dataKey="calls" fill="var(--color-calls)" radius={3} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card className={styles.section}>
            <CardHeader className="pb-2">
              <CardDescription>Visited Company Leads clients</CardDescription>
              <CardTitle className="text-2xl">{trends.cohort.visitedCount}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Bought</span>
                <span className="font-mono font-bold">{trends.cohort.boughtCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Didn&apos;t buy (yet)</span>
                <span className="font-mono font-bold">{trends.cohort.notBoughtCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          All calls
        </Button>
        <Button type="button" size="sm" variant={filter === "mine" ? "default" : "outline"} onClick={() => setFilter("mine")}>
          My calls today
        </Button>
        <Button type="button" size="sm" variant={filter === "followups" ? "default" : "outline"} onClick={() => setFilter("followups")}>
          Follow-ups due ({openFollowUps.length})
        </Button>
      </div>

      <Card className={styles.section} style={{ "--stagger-index": 3 } as React.CSSProperties}>
        <CardContent className="pt-6">
          {filter === "followups" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Last contact</TableHead>
                  <TableHead>Follow-up due</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableEmpty colSpan={4} message="Loading…" />
                ) : openFollowUps.length === 0 ? (
                  <TableEmpty colSpan={4} message="No open follow-ups — every company lead's most recent contact has nothing pending." />
                ) : (
                  openFollowUps.map((f) => (
                    <TableRow key={f.leadId}>
                      <TableCell className="font-medium">{f.client}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {f.latestEntry.action} · {fmtDateTime(f.latestEntry.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={f.overdue ? "destructive" : "outline"}>
                          {f.follow}
                          {f.overdue ? " · Overdue" : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/company-leads/${f.leadId}`}>Open client</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableEmpty colSpan={7} message="Loading…" />
                ) : filtered.length === 0 ? (
                  <TableEmpty colSpan={7} message={filter === "mine" ? "You haven't logged any calls yet today." : "No calls logged yet — use Log a call to start a real contact history."} />
                ) : (
                  filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.client}</TableCell>
                      <TableCell>{e.action}</TableCell>
                      <TableCell className="text-muted-foreground">{e.outcome || "—"}</TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">{e.note || e.detail || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{e.agentName || e.agentKey}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDateTime(e.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {e.leadId && (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/dashboard/company-leads/${e.leadId}`}>Open client</Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
