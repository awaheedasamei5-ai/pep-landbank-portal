"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis } from "recharts";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FolderPlus,
  ListChecks,
  Settings2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSessionStore } from "@/webnext/auth/useSessionStore";
import { type Delta, type OpsIssueRow, useOperationsOverview } from "./use-operations-overview";

// Operations Tracker Command Center -- the real home page the raw
// project-list screen (operations-tracker-screen.tsx, still reachable at
// the "New project" flow) was always missing. Same house pattern as
// dashboard/default's MetricCards + PerformanceOverview + SubscriberOverview
// (see use-manager-overview.ts), applied to real op_issues/op_states/
// op_issue_activity rows across every project, via use-operations-overview.ts.
// The "Team workload" panel is management-only (role gated the same way
// AttendanceScreen.tsx gates its own manager controls: useSessionStore's
// real profile.role, not a cosmetic difference) -- everything else is the
// same real page for staff and management, since RLS already grants every
// signed-in staff member company-wide read on op_* (confirmed in Phase 6/7
// verification), so hiding it from staff would be security theatre, not
// real access control.
const PRIORITY_VARIANT: Record<string, "outline" | "default" | "destructive"> = {
  urgent: "destructive",
  high: "destructive",
  medium: "default",
  low: "outline",
  none: "outline",
};

const TREND_WINDOWS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
] as const;

const trendConfig = {
  count: { label: "Issues opened", color: "var(--chart-1)" },
} satisfies ChartConfig;

const statusChartConfig = {
  backlog: { label: "Backlog", color: "var(--chart-5)" },
  unstarted: { label: "Unstarted", color: "var(--chart-4)" },
  started: { label: "In progress", color: "var(--chart-1)" },
  completed: { label: "Completed", color: "var(--chart-2)" },
  cancelled: { label: "Cancelled", color: "var(--chart-3)" },
} satisfies ChartConfig;

const priorityChartConfig = {
  count: { label: "Issues", color: "var(--chart-1)" },
} satisfies ChartConfig;

function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta.direction === "flat" || delta.value === 0) return null;
  const Icon = delta.direction === "up" ? TrendingUp : TrendingDown;
  const positive = delta.direction === "up";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      <Icon className="size-3" />
      {delta.value}%
    </span>
  );
}

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
  const isManager = useSessionStore((s) => s.profile?.role === "manager");
  const [trendWindow, setTrendWindow] = useState<(typeof TREND_WINDOWS)[number]["value"]>("14");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const trendData = useMemo(() => {
    const all = data?.createdTrend ?? [];
    return all.slice(all.length - Number(trendWindow));
  }, [data?.createdTrend, trendWindow]);

  const filteredQueue = useMemo(() => {
    const all = data?.allOpenIssues ?? [];
    return all.filter((issue) => {
      if (statusFilter !== "all" && issue.stateGroup !== statusFilter) return false;
      if (priorityFilter !== "all" && issue.priority !== priorityFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${issue.projectIdentifier}-${issue.sequence_id} ${issue.name} ${issue.assignees.join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data?.allOpenIssues, search, statusFilter, priorityFilter]);

  const statCards = [
    { icon: ListChecks, label: "Open issues", value: data?.totalOpen, delta: data?.openDelta },
    { icon: AlertTriangle, label: "High priority", value: data?.highPriorityOpen, delta: data?.highPriorityDelta },
    { icon: CalendarClock, label: "Due today", value: data?.dueTodayCount },
    { icon: Clock, label: "Overdue", value: data?.overdueCount },
    { icon: CheckCircle2, label: "Completed", value: data?.completedCount, delta: data?.completedDelta },
  ];

  const statusTotal = data?.statusBreakdown.reduce((s, x) => s + x.count, 0) || 1;
  const nonZeroStatus = data?.statusBreakdown.filter((s) => s.count > 0) ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-5 dark:*:data-[slot=card]:bg-card">
        {statCards.map((c) => (
          <Card key={c.label}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                  <c.icon className="size-4" />
                </div>
                {!isLoading && c.delta && <DeltaBadge delta={c.delta} />}
              </div>
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
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle className="leading-none">Issues opened</CardTitle>
              <CardDescription>Real op_issues.created_at, company-wide across every project.</CardDescription>
            </div>
            <Select value={trendWindow} onValueChange={(v) => setTrendWindow(v as typeof trendWindow)}>
              <SelectTrigger className="w-36" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TREND_WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
                <AreaChart data={trendData} margin={{ top: 0 }}>
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
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : nonZeroStatus.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No issues yet.</p>
            ) : (
              <>
                <ChartContainer config={statusChartConfig} className="mx-auto aspect-square h-48">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie data={nonZeroStatus} dataKey="count" nameKey="group" innerRadius={48} outerRadius={72} strokeWidth={2}>
                      {nonZeroStatus.map((s) => (
                        <Cell key={s.group} fill={s.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {data?.statusBreakdown.map((s) => (
                    <div key={s.group} className="flex items-center gap-1.5 text-xs">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="truncate text-muted-foreground">{s.label}</span>
                      <span className="ml-auto font-medium tabular-nums">{s.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">Cases by priority</CardTitle>
            <CardDescription>Open issues only.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ChartContainer config={priorityChartConfig} className="h-48 w-full">
                <BarChart data={data?.priorityBreakdown ?? []} margin={{ top: 8 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.5} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {isManager && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base leading-none">
                <Users className="size-4" />
                Team workload
              </CardTitle>
              <CardDescription>Management view -- every active staff member's real open/overdue/completed count.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : data && data.workloadByStaff.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No issues assigned to anyone yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                      <TableHead className="text-right">High priority</TableHead>
                      <TableHead className="text-right">Overdue</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.workloadByStaff.map((w) => (
                      <TableRow key={w.key}>
                        <TableCell className="font-medium">{w.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{w.open}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {w.highPriority > 0 ? (
                            <span className="text-destructive">{w.highPriority}</span>
                          ) : (
                            w.highPriority
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {w.overdue > 0 ? <span className="text-destructive">{w.overdue}</span> : w.overdue}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{w.completed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {!isManager && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="leading-none">Quick actions</CardTitle>
              <CardDescription>Jump straight into the work.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" className="h-auto flex-col items-start gap-1 py-3">
                <Link href="/dashboard/operations">
                  <FolderPlus className="size-4" />
                  New project
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto flex-col items-start gap-1 py-3">
                <Link href="/dashboard/operations">
                  <ListChecks className="size-4" />
                  View all projects
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="leading-none">Work queue</CardTitle>
            <CardDescription>
              {filteredQueue.length} open issue{filteredQueue.length === 1 ? "" : "s"}, every project.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search issues, assignees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32" size="sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="backlog">Backlog</SelectItem>
                <SelectItem value="unstarted">Unstarted</SelectItem>
                <SelectItem value="started">In progress</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-32" size="sm">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="grid gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          )}
          {!isLoading && filteredQueue.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No issues match the current filters.</p>
          )}
          {!isLoading && filteredQueue.length > 0 && (
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Issue</TableHead>
                    <TableHead>Assignees</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQueue.map((issue) => (
                    <TableRow key={issue.id} className="cursor-pointer">
                      <TableCell>
                        <Link href={`/dashboard/operations/${issue.projectId}/issues/${issue.id}`} className="hover:underline">
                          <span className="font-mono text-xs text-muted-foreground">
                            {issue.projectIdentifier}-{issue.sequence_id}
                          </span>{" "}
                          <span className="text-sm">{issue.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {issue.assignees.length > 0 ? issue.assignees.join(", ") : "Unassigned"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" style={{ borderColor: issue.stateColor, color: issue.stateColor }}>
                          {issue.stateName}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={PRIORITY_VARIANT[issue.priority]} className="capitalize">
                          {issue.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{issue.target_date ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base leading-none">
              <Settings2 className="size-4" />
              Quick actions
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Button asChild variant="outline" className="h-auto flex-col items-start gap-1 py-3">
              <Link href="/dashboard/operations">
                <FolderPlus className="size-4" />
                New project
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto flex-col items-start gap-1 py-3">
              <Link href="/dashboard/operations">
                <ListChecks className="size-4" />
                View all projects
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

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
