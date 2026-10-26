"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, MonitorSmartphone, Smartphone } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

type RegisteredDevice = {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
};

function deviceLabel(userAgent: string | null) {
  const agent = userAgent ?? "";
  let platform = "Device";
  if (/iPhone|iPad/.test(agent)) platform = "iPhone or iPad";
  else if (/Android/.test(agent)) platform = "Android";
  else if (/Windows/.test(agent)) platform = "Windows";
  else if (/Macintosh|Mac OS X/.test(agent)) platform = "Mac";

  let browser = "browser";
  if (/Edg\//.test(agent)) browser = "Edge";
  else if (/Firefox\//.test(agent)) browser = "Firefox";
  else if (/Chrome\//.test(agent)) browser = "Chrome";
  else if (/Safari\//.test(agent)) browser = "Safari";
  return `${browser} on ${platform}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Africa/Accra",
  }).format(new Date(value));
}

export function MyReminderDevices() {
  const profile = useAuthStore((state) => state.profile);
  const queryClient = useQueryClient();
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const devices = useQuery({
    queryKey: ["myOperationsReminderDevices", profile?.key],
    enabled: Boolean(profile?.active && profile.key),
    queryFn: async (): Promise<RegisteredDevice[]> => {
      const { data, error } = await requireSupabase()
        .from("push_subscriptions")
        .select("id,endpoint,user_agent,created_at")
        .eq("owner_kind", "staff")
        .eq("owner_id", profile?.key ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    let active = true;
    setCurrentEndpoint(null);
    if (!profile?.key || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setCurrentEndpoint(subscription?.endpoint ?? null);
      })
      .catch(() => {
        if (active) setCurrentEndpoint(null);
      });
    return () => {
      active = false;
    };
  }, [profile?.key]);

  async function removeDevice(device: RegisteredDevice) {
    if (!profile?.active || !profile.key || removingId) return;
    setRemovingId(device.id);
    setErrorMessage(null);
    setNotice(null);
    try {
      const { data, error } = await requireSupabase()
        .from("push_subscriptions")
        .delete()
        .eq("id", device.id)
        .eq("owner_kind", "staff")
        .eq("owner_id", profile.key)
        .select("id");
      if (error || data?.length !== 1) throw new Error("The device could not be removed. Refresh and try again.");

      let localCleared = true;
      if (device.endpoint === currentEndpoint && "serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration("/");
          const subscription = await registration?.pushManager.getSubscription();
          localCleared = subscription ? await subscription.unsubscribe() : true;
          if (localCleared) setCurrentEndpoint(null);
        } catch {
          localCleared = false;
        }
      }
      setNotice(
        localCleared
          ? "This device registration was removed. It will receive no further Palmstead reminders."
          : "Server delivery to this device has stopped. Reopen My Schedule here to clear its browser subscription.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["myOperationsReminderDevices", profile.key] }),
        queryClient.invalidateQueries({ queryKey: ["myOperationsReminderActivity", profile.key] }),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The device could not be removed.");
    } finally {
      setRemovingId(null);
    }
  }

  if (profile && !profile.active) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
          <MonitorSmartphone aria-hidden="true" /> Your devices
        </CardTitle>
        <CardDescription>
          Browsers that can receive your Operations task and meeting alerts while the app is closed. Only you can remove
          your registrations here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {notice && (
          <Alert>
            <AlertTitle>Device removed</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {(devices.isError || errorMessage) && (
          <Alert variant="destructive">
            <AlertTitle>Device list needs attention</AlertTitle>
            <AlertDescription>
              {errorMessage ?? "Could not load your devices. Refresh the page to try again."}
            </AlertDescription>
          </Alert>
        )}
        {devices.isPending && <Skeleton className="h-24" />}
        {devices.data?.length === 0 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellOff />
              </EmptyMedia>
              <EmptyTitle>No devices opted in</EmptyTitle>
              <EmptyDescription>
                Enable reminders on a supported phone or computer from My Schedule. SMS reminders follow the separate
                company policy.
              </EmptyDescription>
            </EmptyHeader>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/operations?view=schedule">Open My Schedule</Link>
            </Button>
          </Empty>
        )}
        {devices.data && devices.data.length > 0 && (
          <ul className="divide-y">
            {devices.data.map((device) => (
              <li
                key={device.id}
                className="flex min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Smartphone className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {deviceLabel(device.user_agent)}
                      {device.endpoint === currentEndpoint && <Badge variant="secondary">This device</Badge>}
                    </p>
                    <p className="text-muted-foreground text-xs">Registered {dateLabel(device.created_at)}</p>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(removingId)}
                      className="self-start sm:shrink-0"
                    >
                      Remove device
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Stop alerts on this device?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {deviceLabel(device.user_agent)} will stop receiving Palmstead device reminders for your
                        account. You can opt in again from My Schedule on that device.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep device</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void removeDevice(device)}>
                        Remove device
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
