"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, ClipboardList, Megaphone, MapPinned } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { today } from "@/lib/palmstead/format";
import { useManagerOverview } from "@/lib/palmstead/use-manager-overview";
import { useAuthStore } from "@/stores/auth/auth-store";
import { useAnnouncements } from "../../announcements/_components/use-announcements";
import { useMySchedule } from "../../operations/_components/use-my-schedule";

function weekEnd(start: string): string {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function WorkspaceHome() {
  const profile = useAuthStore((state) => state.profile);
  const start = today();
  const schedule = useMySchedule(profile?.key, start, weekEnd(start));
  const announcements = useAnnouncements(profile?.key);
  const overview = useManagerOverview();
  const upcoming = (schedule.data ?? []).filter((item) => item.status === "open").slice(0, 4);
  const published = (announcements.data ?? []).filter((item) => new Date(item.publishAt).getTime() <= Date.now());
  const news = published.slice(0, 3);
  const unread = published.filter((item) => !item.isRead).length;
  const firstName = profile?.name?.trim().split(/\s+/)[0] || "there";

  return (
    <section className="grid gap-4" aria-label="Workspace overview">
      <div className="rounded-2xl border bg-card p-5 shadow-xs sm:p-7">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Palmstead workspace</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hello, {firstName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile?.role === "manager" ? "Review the team and open the work that needs attention." : "Your next tasks, client visits and company updates are here."}
            </p>
          </div>
          <Link href="/dashboard/operations?view=schedule" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <CalendarDays className="size-4" aria-hidden="true" /> Open schedule
          </Link>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Link href="/dashboard/operations" className="flex min-w-0 items-center gap-3 rounded-xl border bg-background p-3 transition-colors hover:bg-muted/60">
            <ClipboardList className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Operations</span><span className="block text-xs text-muted-foreground">Tasks and projects</span></span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
          <Link href="/dashboard/site-visits" className="flex min-w-0 items-center gap-3 rounded-xl border bg-background p-3 transition-colors hover:bg-muted/60">
            <MapPinned className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Site visits</span><span className="block text-xs text-muted-foreground">{overview.data ? `${overview.data.siteVisitsCount} visible visits` : "Bookings and outcomes"}</span></span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
          <Link href="/dashboard/announcements" className="flex min-w-0 items-center gap-3 rounded-xl border bg-background p-3 transition-colors hover:bg-muted/60">
            <Megaphone className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Company updates</span><span className="block text-xs text-muted-foreground">{unread ? `${unread} unread` : "News and notices"}</span></span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Coming up</CardTitle>
            <Link href="/dashboard/operations?view=schedule" className="text-sm font-medium text-primary hover:underline">View schedule</Link>
          </CardHeader>
          <CardContent className="grid gap-2">
            {schedule.isLoading && <p className="text-sm text-muted-foreground">Loading your schedule…</p>}
            {schedule.isError && <p className="text-sm text-muted-foreground">Schedule is unavailable right now. Open it to retry.</p>}
            {!schedule.isLoading && !schedule.isError && upcoming.length === 0 && <p className="text-sm text-muted-foreground">No open tasks in the next seven days.</p>}
            {upcoming.map((item) => (
              <Link key={item.id} href="/dashboard/operations?view=schedule" className="flex min-w-0 items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50">
                <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{item.date}{item.startTime ? ` · ${item.startTime}` : ""}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Company updates</CardTitle>
            <Link href="/dashboard/announcements" className="text-sm font-medium text-primary hover:underline">All updates</Link>
          </CardHeader>
          <CardContent className="grid gap-2">
            {announcements.isLoading && <p className="text-sm text-muted-foreground">Loading updates…</p>}
            {announcements.isError && <p className="text-sm text-muted-foreground">Updates are unavailable right now. Open the information center to retry.</p>}
            {!announcements.isLoading && !announcements.isError && news.length === 0 && <p className="text-sm text-muted-foreground">No active company updates.</p>}
            {news.map((item) => (
              <Link key={item.id} href="/dashboard/announcements" className="flex min-w-0 items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50">
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{item.createdAt.slice(0, 10)}</span></span>
                {!item.isRead && <Badge variant="secondary">New</Badge>}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

