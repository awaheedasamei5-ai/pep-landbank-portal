"use client";

import Link from "next/link";
import { CalendarDays, ClipboardList, FlagTriangleRight, Megaphone, MapPinned } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { today } from "@/lib/palmstead/format";
import { canOpenNavigationItem, useNavigationAccess } from "@/lib/permissions/use-navigation-access";
import { useAuthStore } from "@/stores/auth/auth-store";
import { useAnnouncements } from "../../announcements/_components/use-announcements";
import { useMySchedule } from "../../operations/_components/use-my-schedule";
import { useSiteVisits } from "@/webnext/features/site-visits/hooks/useSiteVisits";
import { useSessionStore } from "@/webnext/auth/useSessionStore";
import { getDataSource } from "@/webnext/data/source";
import { MetricCards } from "./metric-cards";

function weekEnd(start: string): string {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function WorkspaceHome() {
  const profile = useAuthStore((state) => state.profile);
  const isManager = profile?.role === "manager";
  const access = useNavigationAccess(profile?.key, isManager);
  const canViewOperations = canOpenNavigationItem("operations-tracker", access.data, isManager);
  const canViewSchedule = isManager || access.data?.["operations.todos.view"] === true || access.data?.["operations.meetings.view"] === true;
  const canViewAnnouncements = canOpenNavigationItem("announcements", access.data, isManager);
  const start = today();
  const schedule = useMySchedule(canViewSchedule ? profile?.key : undefined, start, weekEnd(start));
  const announcements = useAnnouncements(canViewAnnouncements ? profile?.key : undefined);
  const myVisits = useSiteVisits();
  const demoMode = useSessionStore((state) => state.demoMode);
  const teamVisits = useQuery({
    queryKey: ["siteVisitsAll"],
    enabled: Boolean(isManager && profile?.key),
    queryFn: () => getDataSource(demoMode).siteVisits.listAll(),
  });
  const visibleVisits = isManager ? teamVisits : myVisits;
  const nextVisits = (visibleVisits.data ?? [])
    .filter((visit) => !visit.deletedAt && visit.visitDate >= start && visit.status.toLowerCase() !== "cancelled")
    .sort((a, b) => `${a.visitDate} ${a.visitTime ?? ""}`.localeCompare(`${b.visitDate} ${b.visitTime ?? ""}`))
    .slice(0, 3);
  const upcoming = (schedule.data ?? []).filter((item) => item.status === "open").slice(0, 2);
  const published = (announcements.data ?? []).filter((item) => item.active && new Date(item.publishAt).getTime() <= Date.now() && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now()));
  const news = published.slice(0, 2);
  const unread = published.filter((item) => !item.isRead).length;
  const firstName = profile?.name?.trim().split(/\s+/)[0] || "there";

  return (
    <section className="grid gap-4" aria-label="Workspace overview">
      <div className="relative overflow-hidden rounded-2xl border bg-linear-to-br from-primary/10 via-card to-card p-5 shadow-xs sm:p-7">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Palmstead workspace</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hello, {firstName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile?.role === "manager" ? "Review the team and open the work that needs attention." : "Your next tasks, client visits and company updates are here."}
            </p>
          </div>
          {canViewSchedule && <Link href="/dashboard/operations?view=schedule" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <CalendarDays className="size-4" aria-hidden="true" /> Open schedule
          </Link>}
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-sm">
          {canViewOperations && <Link href="/dashboard/operations" className="inline-flex min-h-8 items-center gap-2 font-medium hover:text-primary"><ClipboardList className="size-4 text-primary" aria-hidden="true" />Operations</Link>}
          <Link href="/dashboard/site-visits" className="inline-flex min-h-8 items-center gap-2 font-medium hover:text-primary"><MapPinned className="size-4 text-primary" aria-hidden="true" />Site visits</Link>
          <Link href="/dashboard/banners" className="inline-flex min-h-8 items-center gap-2 font-medium hover:text-primary"><FlagTriangleRight className="size-4 text-primary" aria-hidden="true" />Banners</Link>
          {canViewAnnouncements && <Link href="/dashboard/announcements" className="inline-flex min-h-8 items-center gap-2 font-medium hover:text-primary"><Megaphone className="size-4 text-primary" aria-hidden="true" />Company updates{unread ? <Badge variant="secondary">{unread}</Badge> : null}</Link>}
        </div>
      </div>

      <MetricCards />
      <Card className="min-w-0">
        <CardHeader><CardTitle>Today and next</CardTitle></CardHeader>
        <CardContent className="grid min-w-0 gap-5 lg:grid-cols-3 lg:divide-x">
        {canViewSchedule && <div className="min-w-0 lg:pr-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Coming up</h2>
            <Link href="/dashboard/operations?view=schedule" className="text-sm font-medium text-primary hover:underline">View schedule</Link>
          </div>
          <div className="grid gap-2">
            {schedule.isLoading && <p className="text-sm text-muted-foreground">Loading your schedule…</p>}
            {schedule.isError && <p className="text-sm text-muted-foreground">Schedule is unavailable right now. Open it to retry.</p>}
            {!schedule.isLoading && !schedule.isError && upcoming.length === 0 && <p className="text-sm text-muted-foreground">No open tasks in the next seven days.</p>}
            {upcoming.map((item) => (
              <Link key={item.id} href={`/dashboard/operations?view=schedule&todo=${encodeURIComponent(item.id)}&date=${item.date}`} className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg border p-3 hover:bg-muted/50">
                <span className="min-w-0 break-words text-sm font-medium">{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.date}{item.startTime ? ` · ${item.startTime}` : ""}</span>
              </Link>
            ))}
          </div>
        </div>}
        <div className="min-w-0 lg:px-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{isManager ? "Upcoming team visits" : "My upcoming visits"}</h2>
            <Link href="/dashboard/site-visits" className="shrink-0 text-sm font-medium text-primary hover:underline">All visits</Link>
          </div>
          <div className="grid gap-2">
            {visibleVisits.isLoading && <p className="text-sm text-muted-foreground">Loading visits…</p>}
            {visibleVisits.isError && <p role="alert" className="text-sm text-destructive">Visits are unavailable. Open Site Visits to retry.</p>}
            {!visibleVisits.isLoading && !visibleVisits.isError && nextVisits.length === 0 && <p className="text-sm text-muted-foreground">No upcoming visits recorded.</p>}
            {nextVisits.map((visit) => <Link key={visit.id} href={`/dashboard/site-visits/${visit.id}`} className="flex min-w-0 items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50">
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{visit.name}</span><span className="block truncate text-xs text-muted-foreground">{isManager ? `${visit.agentName} · ` : ""}{visit.site || "Site pending"}</span></span>
              <span className="shrink-0 text-right text-xs text-muted-foreground">{visit.visitDate}{visit.visitTime ? <span className="block">{visit.visitTime}</span> : null}</span>
            </Link>)}
          </div>
        </div>
        {canViewAnnouncements && <div className="min-w-0 lg:pl-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Company updates</h2>
            <Link href="/dashboard/announcements" className="text-sm font-medium text-primary hover:underline">All updates</Link>
          </div>
          <div className="grid gap-2">
            {announcements.isLoading && <p className="text-sm text-muted-foreground">Loading updates…</p>}
            {announcements.isError && <p className="text-sm text-muted-foreground">Updates are unavailable right now. Open the information center to retry.</p>}
            {!announcements.isLoading && !announcements.isError && news.length === 0 && <p className="text-sm text-muted-foreground">No active company updates.</p>}
            {news.map((item) => (
              <Link key={item.id} href="/dashboard/announcements" className="flex min-w-0 items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50">
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{item.createdAt.slice(0, 10)}</span></span>
                {!item.isRead && <Badge variant="secondary">New</Badge>}
              </Link>
            ))}
          </div>
        </div>}
        </CardContent>
      </Card>
    </section>
  );
}


