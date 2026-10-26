"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BellRing, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

type ReminderEvent = {
  id: string;
  channel: "sms" | "device";
  item_kind: "task" | "meeting";
  event_kind: "due" | "missed" | "meeting_reminder";
  status: string;
  title: string;
  scheduled_for: string;
  updated_at: string;
  accepted_devices: number;
  provider_accepted_at: string | null;
};

type ReminderActivity = { device_count: number; events: ReminderEvent[] };

function ghanaTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value));
}

function eventLabel(event: ReminderEvent) {
  if (event.item_kind === "meeting") return "Meeting starting soon";
  return event.event_kind === "missed" ? "Missed-task follow-up" : "Task due";
}

function deliveryState(event: ReminderEvent) {
  if (event.channel === "sms" && event.status === "accepted") {
    return {
      label: "SMS provider accepted",
      detail: "The SMS provider accepted this text; handset delivery is not confirmed.",
      attention: false,
    };
  }
  if (event.channel === "device" && event.status === "sent") {
    const count = event.accepted_devices;
    return {
      label: "Push service accepted",
      detail: `${count} device${count === 1 ? "" : "s"} accepted the alert. Display and sound depend on browser and device settings.`,
      attention: false,
    };
  }
  if (event.status === "queued" || event.status === "retry" || event.status === "sending") {
    return {
      label: event.status === "retry" ? "Retry queued" : "Queued",
      detail: "The reminder is waiting for its scheduled time or the next delivery attempt.",
      attention: false,
    };
  }
  if (event.status === "unsubscribed") {
    return {
      label: "No device",
      detail: "No subscribed device was available for this alert. Enable device reminders in My Schedule.",
      attention: true,
    };
  }
  if (event.status === "cancelled") {
    return {
      label: "Cancelled",
      detail: "The task, meeting or invitation changed before this reminder was sent.",
      attention: false,
    };
  }
  if (event.status === "needs_review") {
    return {
      label: "Under review",
      detail: "Management is checking an uncertain SMS provider result before any resend.",
      attention: true,
    };
  }
  return {
    label: event.status === "blocked" ? "Blocked" : "Failed",
    detail: "This reminder was not accepted. Management can review the delivery service and staff contact details.",
    attention: true,
  };
}

export function MyOperationsReminderActivity() {
  const profile = useAuthStore((state) => state.profile);
  const activity = useQuery({
    queryKey: ["myOperationsReminderActivity", profile?.key],
    enabled: Boolean(profile?.active && profile.key),
    refetchInterval: 30_000,
    queryFn: async (): Promise<ReminderActivity> => {
      const { data, error } = await requireSupabase().rpc("get_my_operations_reminder_activity");
      if (error) throw error;
      return data as ReminderActivity;
    },
  });

  if (profile && !profile.active) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Active staff access required</AlertTitle>
        <AlertDescription>Ask Management to check your account before viewing reminder activity.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid min-w-0 gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/dashboard/operations?view=schedule">
            <ArrowLeft data-icon="inline-start" /> My Schedule
          </Link>
        </Button>
        <PageHeader
          title="My reminder activity"
          description="Your recent Operations task texts and device alerts, shown in Ghana time."
          action={
            <Button variant="outline" disabled={activity.isFetching} onClick={() => activity.refetch()}>
              <RefreshCw data-icon="inline-start" className={activity.isFetching ? "animate-spin" : undefined} />
              Refresh
            </Button>
          }
        />
      </div>

      <Alert>
        <BellRing />
        <AlertTitle>Delivery status has limits</AlertTitle>
        <AlertDescription>
          A provider accepting a text or push alert does not confirm it appeared on your phone. Device alerts also
          require permission in your browser and operating system.
        </AlertDescription>
      </Alert>

      {activity.isError && (
        <Alert variant="destructive">
          <AlertTitle>Could not load reminder activity</AlertTitle>
          <AlertDescription>Check your connection, then refresh this page.</AlertDescription>
        </Alert>
      )}

      {activity.isPending && (
        <div className="grid gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}
      {activity.data && (
        <Card>
          <CardHeader>
            <CardTitle>Recent reminders</CardTitle>
            <CardDescription>
              {activity.data.device_count} opted-in device{activity.data.device_count === 1 ? "" : "s"} on your account
              · latest {activity.data.events.length} record{activity.data.events.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activity.data.events.length === 0 ? (
              <div className="grid justify-items-center gap-2 rounded-lg border border-dashed p-6 text-center">
                <BellRing className="text-muted-foreground" />
                <p className="font-medium">No reminders have been queued for you yet</p>
                <p className="max-w-md text-muted-foreground text-sm">
                  Timed tasks and invited meetings will appear here once their reminders are scheduled.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link href="/dashboard/operations?view=schedule">Open My Schedule</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {activity.data.events.map((event) => {
                  const state = deliveryState(event);
                  return (
                    <li
                      key={`${event.channel}-${event.id}`}
                      className="flex min-w-0 flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium">{event.title}</p>
                        <p className="text-muted-foreground text-sm">
                          {eventLabel(event)} · {event.channel === "sms" ? "SMS" : "Device alert"} · Scheduled{" "}
                          {ghanaTime(event.scheduled_for)}
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">{state.detail}</p>
                      </div>
                      <Badge
                        variant={state.attention ? "destructive" : "secondary"}
                        className="self-start whitespace-normal text-left sm:shrink-0"
                      >
                        {state.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
