"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarCheck2, ListTodo } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { today } from "@/lib/palmstead/format";
import { useNavigationAccess } from "@/lib/permissions/use-navigation-access";
import { useAuthStore } from "@/stores/auth/auth-store";
import { useSessionStore } from "@/webnext/auth/useSessionStore";
import { getDataSource } from "@/webnext/data/source";
import { useSiteVisits } from "@/webnext/features/site-visits/hooks/useSiteVisits";
import { addScheduleDays } from "../../operations/_components/schedule-time";
import { useMySchedule } from "../../operations/_components/use-my-schedule";

function NumberTile({ value, label }: { value: number | string; label: string }) {
  return <div className="min-w-0 rounded-lg bg-muted/50 p-3"><p className="text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}

export function DashboardActivity() {
  const profile = useAuthStore((state) => state.profile);
  const isManager = profile?.role === "manager";
  const demoMode = useSessionStore((state) => state.demoMode);
  const access = useNavigationAccess(profile?.key, isManager);
  const canViewSchedule = isManager || access.data?.["operations.todos.view"] === true || access.data?.["operations.meetings.view"] === true;
  const day = today();
  const myVisits = useSiteVisits();
  const teamVisits = useQuery({
    queryKey: ["siteVisitsAll"],
    enabled: Boolean(isManager && profile?.key),
    queryFn: () => getDataSource(demoMode).siteVisits.listAll(),
  });
  const visits = isManager ? teamVisits : myVisits;
  const tasks = useMySchedule(canViewSchedule ? profile?.key : undefined, addScheduleDays(day, -30), addScheduleDays(day, 7));
  const activeVisits = (visits.data ?? []).filter((visit) => !visit.deletedAt && visit.status.toLowerCase() !== "cancelled");
  const pastVisits = activeVisits.filter((visit) => visit.visitDate < day);
  const attended = pastVisits.filter((visit) => visit.attended === true).length;
  const noShow = pastVisits.filter((visit) => visit.attended === false).length;
  const unconfirmed = pastVisits.filter((visit) => visit.attended === null).length;
  const upcoming = activeVisits.filter((visit) => visit.visitDate >= day).length;
  const totalPast = pastVisits.length || 1;
  const work = tasks.data ?? [];
  const overdue = work.filter((task) => task.status === "open" && task.date < day).length;
  const dueSoon = work.filter((task) => task.status === "open" && task.date >= day).length;
  const completed = work.filter((task) => task.status === "done").length;

  return <section className="grid min-w-0 gap-4 lg:grid-cols-2" aria-label="Activity snapshot">
    <Card className="h-full min-w-0">
      <CardHeader><CardTitle className="flex items-center gap-2"><CalendarCheck2 className="size-4 text-primary" aria-hidden="true" /> Site visit outcomes</CardTitle><CardDescription>{isManager ? "Team" : "My"} recorded visits, attendance and next bookings</CardDescription></CardHeader>
      <CardContent className="grid gap-4">
        {visits.isLoading && <p className="text-sm text-muted-foreground">Loading visit outcomes…</p>}
        {visits.isError && <p role="alert" className="text-sm text-destructive">Visit outcomes are unavailable right now.</p>}
        {visits.data && <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><NumberTile value={attended} label="Attended" /><NumberTile value={noShow} label="Did not attend" /><NumberTile value={unconfirmed} label="Unconfirmed" /><NumberTile value={upcoming} label="Upcoming" /></div>
          <div><div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${attended} attended, ${noShow} did not attend, ${unconfirmed} past visits unconfirmed`}>
            {attended > 0 && <span className="bg-primary" style={{ width: `${(attended / totalPast) * 100}%` }} />}
            {noShow > 0 && <span className="bg-chart-3" style={{ width: `${(noShow / totalPast) * 100}%` }} />}
            {unconfirmed > 0 && <span className="bg-muted-foreground/40" style={{ width: `${(unconfirmed / totalPast) * 100}%` }} />}
          </div><p className="mt-2 text-xs text-muted-foreground">Past scheduled visits · attendance is counted only when recorded</p></div>
        </>}
        <Link href="/dashboard/site-visits/reports" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline">Explore site visit report <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
      </CardContent>
    </Card>
    {canViewSchedule && <Card className="h-full min-w-0">
      <CardHeader><CardTitle className="flex items-center gap-2"><ListTodo className="size-4 text-primary" aria-hidden="true" /> My work queue</CardTitle><CardDescription>Assigned tasks scheduled in the last 30 days and next seven days</CardDescription></CardHeader>
      <CardContent className="grid gap-4">
        {tasks.isLoading && <p className="text-sm text-muted-foreground">Loading your tasks…</p>}
        {tasks.isError && <p role="alert" className="text-sm text-destructive">Tasks are unavailable right now.</p>}
        {tasks.data && <><div className="grid grid-cols-3 gap-2"><NumberTile value={overdue} label="Overdue" /><NumberTile value={dueSoon} label="Coming up" /><NumberTile value={completed} label="Completed" /></div>
          <p className="text-sm text-muted-foreground">{overdue > 0 ? `${overdue} open task${overdue === 1 ? "" : "s"} passed the scheduled date.` : dueSoon > 0 ? `${dueSoon} open task${dueSoon === 1 ? "" : "s"} scheduled within seven days.` : "No open tasks in this window."}</p></>}
        <Link href="/dashboard/operations?view=schedule" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline">Open my planner <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
      </CardContent>
    </Card>}
  </section>;
}
