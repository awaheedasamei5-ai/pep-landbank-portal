"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

type ReminderStatus = "queued" | "sending" | "accepted" | "failed" | "needs_review" | "cancelled" | "blocked";
type ReminderEntry = {
  id: string;
  todo_id: string;
  event_kind: "due" | "missed";
  status: ReminderStatus;
  attempt_count: number;
  scheduled_for: string;
  provider_accepted_at: string | null;
  updated_at: string;
  task_title: string;
  staff_name: string;
  status_detail: string | null;
};
type ReminderHealth = {
  counts: Partial<Record<ReminderStatus, number>>;
  messages: ReminderEntry[];
  scheduler: {
    active: boolean;
    schedule: string | null;
    last_run_at: string | null;
    last_run_status: string | null;
  };
  missed_grace_minutes: number;
};

const STATUSES: { key: ReminderStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "sending", label: "Sending" },
  { key: "accepted", label: "Provider accepted" },
  { key: "failed", label: "Failed" },
  { key: "needs_review", label: "Check provider" },
  { key: "blocked", label: "Blocked" },
  { key: "cancelled", label: "Cancelled" },
];

const ATTENTION = new Set<ReminderStatus>(["failed", "needs_review", "blocked"]);

function timeInGhana(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value));
}

export function OperationsReminderHealthScreen() {
  const profile = useAuthStore((state) => state.profile);
  const isManager = profile?.role === "manager" && profile.active;
  const health = useQuery({
    queryKey: ["operationsTaskReminderHealth"],
    enabled: isManager,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc("get_operations_task_reminder_health");
      if (error) throw error;
      return data as ReminderHealth;
    },
  });

  if (!profile) return <p className="text-sm text-muted-foreground">Loading your profile…</p>;
  if (!isManager) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Management access required</AlertTitle>
        <AlertDescription>
          Reminder delivery records are limited to Management.{" "}
          <Link className="underline" href="/dashboard/operations?view=schedule">
            Return to My Schedule
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }

  const scheduler = health.data?.scheduler;
  const schedulerIsCurrent = Boolean(
    scheduler?.active &&
      scheduler.last_run_at &&
      Date.now() - Date.parse(scheduler.last_run_at) < 5 * 60_000 &&
      scheduler.last_run_status === "succeeded",
  );

  return (
    <div className="grid gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/dashboard/operations?view=schedule">
            <ArrowLeft /> My Schedule
          </Link>
        </Button>
        <PageHeader
          title="Task reminder delivery"
          description="Review the automated start-time and missed-task SMS queue. All times are shown in Ghana time."
          action={
            <Button variant="outline" disabled={health.isFetching} onClick={() => health.refetch()}>
              <RefreshCw className={health.isFetching ? "animate-spin" : undefined} />
              {health.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          }
        />
      </div>

      {health.isError && (
        <Alert variant="destructive">
          <AlertTitle>Reminder records could not be loaded</AlertTitle>
          <AlertDescription>
            {health.error instanceof Error ? health.error.message : "Check your connection and refresh."}
          </AlertDescription>
        </Alert>
      )}

      {health.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : health.data ? (
        <>
          <Alert variant={schedulerIsCurrent ? "default" : "destructive"}>
            <AlertTitle>
              {schedulerIsCurrent ? "Reminder worker is running" : "Reminder worker needs attention"}
            </AlertTitle>
            <AlertDescription>
              The worker checks queued reminders every minute. Last run: {timeInGhana(scheduler?.last_run_at ?? null)} ·{" "}
              {scheduler?.last_run_status ?? "No run recorded"}.
              {!scheduler?.active && <span className="block">The scheduled worker is not active.</span>}
              <span className="mt-1 block">
                Missed-task follow-ups wait until the task end time, then {health.data.missed_grace_minutes} more
                minutes.
              </span>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {STATUSES.map(({ key, label }) => (
              <Card key={key} size="sm">
                <CardContent className="pt-3">
                  <p className="text-xs leading-snug text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{health.data?.counts[key] ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent task texts</CardTitle>
              <CardDescription>
                Provider accepted means accepted by the SMS service; it does not confirm handset delivery. Phone
                numbers, message bodies, provider IDs, and raw provider errors are kept private.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {health.data.messages.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="font-medium">No reminder texts have been queued yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Scheduled-start texts are queued when a timed task becomes due. Missed-task follow-ups are queued
                    after the task end and grace period.
                  </p>
                  <Button asChild variant="outline" className="mt-4">
                    <Link href="/dashboard/operations?view=schedule">Open My Schedule</Link>
                  </Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {health.data.messages.map((message) => (
                    <li
                      key={message.id}
                      className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="break-words font-medium">{message.task_title}</p>
                        <p className="text-sm text-muted-foreground">
                          {message.staff_name} ·{" "}
                          {message.event_kind === "due" ? "Due-time reminder" : "Missed-task follow-up"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Scheduled {timeInGhana(message.scheduled_for)} · {message.attempt_count} attempt
                          {message.attempt_count === 1 ? "" : "s"}
                        </p>
                        {message.provider_accepted_at && (
                          <p className="text-xs text-muted-foreground">
                            Provider accepted {timeInGhana(message.provider_accepted_at)}
                          </p>
                        )}
                        {message.status_detail && (
                          <p
                            className={`break-words text-sm ${ATTENTION.has(message.status) ? "text-destructive" : "text-muted-foreground"}`}
                          >
                            {message.status_detail}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={ATTENTION.has(message.status) ? "destructive" : "secondary"}
                        className="w-fit shrink-0"
                      >
                        {STATUSES.find(({ key }) => key === message.status)?.label ?? message.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
