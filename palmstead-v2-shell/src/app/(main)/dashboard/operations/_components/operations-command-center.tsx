"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ListChecks, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { type OpsIssueRow, useOperationsOverview } from "./use-operations-overview";

// Operations Tracker Command Center -- the real home page the raw
// project-list screen (operations-tracker-screen.tsx, still reachable at
// the "New project" flow) was always missing. Same house pattern as
// dashboard/default's MetricCards + PerformanceOverview + SubscriberOverview
// (see use-manager-overview.ts), applied to real op_issues/op_states/
// op_issue_activity rows across every project, via use-operations-overview.ts.
const PRIORITY_VARIANT: Record<string, "outline" | "default" | "destructive"> = {
  urgent: "destructive",
  high: "destructive",
  medium: "default",
  low: "outline",
  none: "outline",
};

const STATUS_GROUP_COLOR: Record<string, string> = {
  backlog: "var(--chart-5)",
  unstarted: "var(--chart-4)",
  started: "var(--chart-1)",
  completed: "var(--chart-2)",
  cancelled: "var(--chart-3)",
};

const trendConfig = {
  count: { label: "Issues opened", color: "var(--chart-1)" },
} satisfies ChartConfig;

function IssueRowLink({ issue }: { issue: OpsIssueRow }) {
  return (
    <Link
      href={`/dashboard/operations/${issue.projectId}/issues/${issue.id}`}
      className="flex items-center justify-between gap-3 border-b py-2 last:border-0 hover:bg-muted/50"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {issue.projectIdentifier}-{issue.sequence_id}
        </span>
        <span className="truncate text-sm">{issue.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {issue.target_date && <span className="text-xs text-muted-foreground">{issue.target_date}</span>}
        <Badge variant="outline" style={{ borderColor: issue.stateColor, color: issue.stateColor }}>
          {issue.stateName}
        </Badge>
        <Badge variant={PRIORITY_VARIANT[issue.priority]} className="capitalize">
          {issue.priority}
        </Badge>
      </div>
    </Link>
  );
}

export function OperationsCommandCenter() {
  const { data, isLoading } = useOperationsOverview();

  const statCards = [
    { icon: ListChecks, label: "Open issues", value: data?.totalOpen },
    { icon: AlertTriangle, label: "High priority", value: data?.highPriorityOpen },
    { icon: CalendarClock, label: "Due today", value: data?.dueTodayCount },
    { icon: Clock, label: "Overdue", value: data?.overdueCount },
    { icon: CheckCircle2, label: "Completed", value: data?.completedCount },
  ];

  const statusTotal = data?.statusBreakdown.reduce((s, x) => s + x.count, 0) || 1;
  const priorityTotal = data?.priorityBreakdown.reduce((s, x) => s + x.count, 0) || 1;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-5 dark:*:data-[slot=card]:bg-card">
        {statCards.map((c) => (
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
              <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
                {isLoading ? <Skeleton className="h-8 w-10" /> : (c.value ?? 0)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && data && data.attention.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-destructive" />
              Needs attention
            </CardTitle>
            <CardDescription>
              High/urgent priority, overdue or due within 2 days, across every project -- real-time, not a fixed list.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-0">
            {data.attention.slice(0, 5).map((issue) => (
              <IssueRowLink key={issue.id} issue={issue} />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 @container/card">
          <CardHeader>
            <CardTitle className="leading-none">Issues opened, trailing 14 days</CardTitle>
            <CardDescription>Real op_issues.created_at, company-wide across every project.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
                <AreaChart data={data?.createdTrend ?? []} margin={{ top: 0 }}>
                  <defs>
                    <linearGradient id="fillOpsTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.36} />
                      <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeOpacity={0.5} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent className="w-40" indicator="line" />} />
                  <Area
                    dataKey="count"
                    type="natural"
                    fill="url(#fillOpsTrend)"
                    stroke="var(--color-count)"
                    strokeWidth={1.5}
                    dot={false}
                    fillOpacity={1}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Status</CardTitle>
            <CardDescription>Every issue, every project.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {isLoading && <Skeleton className="h-32 w-full" />}
            {data?.statusBreakdown.map((s) => (
              <div key={s.group} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-muted-foreground text-sm">{s.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(s.count ? 4 : 0, Math.round((s.count / statusTotal) * 100))}%`,
                      backgroundColor: STATUS_GROUP_COLOR[s.group],
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-medium text-sm tabular-nums">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle className="leading-none">Work queue</CardTitle>
              <CardDescription>Open issues, highest priority and nearest due date first.</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/operations">
                <Plus />
                New issue
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-0">
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            {!isLoading && data?.workQueue.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">No open issues. Everything is caught up.</p>
            )}
            {data?.workQueue.map((issue) => (
              <IssueRowLink key={issue.id} issue={issue} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Priority mix</CardTitle>
            <CardDescription>Open issues only.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {isLoading && <Skeleton className="h-32 w-full" />}
            {data?.priorityBreakdown.map((p) => (
              <div key={p.priority} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-muted-foreground text-sm">{p.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(p.count ? 4 : 0, Math.round((p.count / priorityTotal) * 100))}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-medium text-sm tabular-nums">{p.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="leading-none">Recent activity</CardTitle>
          <CardDescription>Real op_issue_activity rows, across every project.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && data?.recentActivity.length === 0 && (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          )}
          {data?.recentActivity.map((a) => (
            <Link
              key={a.id}
              href={`/dashboard/operations/${a.projectId}/issues/${a.issueId}`}
              className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-0 hover:bg-muted/50"
            >
              <p className="min-w-0">
                <span className="font-medium">{a.actorName}</span>{" "}
                {a.verb === "escalated" ? (
                  <>escalated</>
                ) : a.field === "state" ? (
                  <>changed status to {a.newValue}</>
                ) : a.field ? (
                  <>
                    changed {a.field} to {a.newValue}
                  </>
                ) : (
                  <>commented on</>
                )}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {a.projectIdentifier}-{a.issueSequence}
                </span>{" "}
                <span className="text-muted-foreground">{a.issueName}</span>
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
