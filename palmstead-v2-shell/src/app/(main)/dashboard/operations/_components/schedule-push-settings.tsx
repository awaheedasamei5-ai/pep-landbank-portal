"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import { ArrowUpRight, BellRing, Check, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

type DeviceState = "checking" | "unsupported" | "disabled" | "enabled" | "denied" | "busy" | "error";
type PushConfig = { publicKey: string };

function decodeApplicationServerKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function requestNotificationPermission(): Promise<NotificationPermission> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Notification.requestPermission(),
      new Promise<NotificationPermission>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "The browser did not answer the notification request. Check its site permissions, then try again.",
              ),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function SchedulePushSettings() {
  const profile = useAuthStore((state) => state.profile);
  const [deviceState, setDeviceState] = useState<DeviceState>("checking");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inspectionId = useRef(0);

  const inspectDevice = useCallback(async () => {
    const requestId = ++inspectionId.current;
    setDeviceState("checking");
    setErrorMessage(null);
    if (!profile?.key) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setDeviceState("unsupported");
      return;
    }
    try {
      const serviceWorker = await navigator.serviceWorker.register("/operations-push-sw.js", { scope: "/" });
      const subscription = await serviceWorker.pushManager.getSubscription();
      if (requestId !== inspectionId.current) return;
      setRegistration(serviceWorker);
      if (subscription) {
        const { data, error } = await requireSupabase()
          .from("push_subscriptions")
          .select("id")
          .eq("owner_kind", "staff")
          .eq("owner_id", profile.key)
          .eq("endpoint", subscription.endpoint)
          .maybeSingle();
        if (error) throw new Error("Could not check which account owns this device reminder.");
        if (requestId !== inspectionId.current) return;
        if (data) setDeviceState("enabled");
        else {
          // A shared browser may still hold a previous staff member's endpoint.
          // Revoke it before this account can opt in with a fresh subscription.
          if (!(await subscription.unsubscribe())) throw new Error("Could not clear an old device reminder.");
          if (requestId !== inspectionId.current) return;
          setDeviceState("disabled");
        }
      } else if (Notification.permission === "denied") setDeviceState("denied");
      else setDeviceState("disabled");
    } catch (error) {
      if (requestId !== inspectionId.current) return;
      setErrorMessage(
        error instanceof Error ? error.message : "This browser could not prepare background notifications. Try again.",
      );
      setDeviceState("error");
    }
  }, [profile?.key]);

  useEffect(() => {
    void inspectDevice();
    return () => {
      inspectionId.current += 1;
    };
  }, [inspectDevice]);

  async function enableDevice() {
    if (!profile?.key || !registration) return;
    setErrorMessage(null);
    setDeviceState("busy");
    try {
      const permission = Notification.permission === "granted" ? "granted" : await requestNotificationPermission();
      if (permission !== "granted") {
        setDeviceState(permission === "denied" ? "denied" : "disabled");
        return;
      }

      const { data, error } = await requireSupabase().functions.invoke<PushConfig>("get-push-config");
      if (!data?.publicKey) {
        throw new Error(error?.message || "The reminder service did not return its public device key.");
      }

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(data.publicKey) as BufferSource,
        }));
      const keys = subscription.toJSON().keys;
      if (!keys?.p256dh || !keys.auth) throw new Error("This browser did not return a complete push subscription.");

      const { error: saveError } = await requireSupabase()
        .from("push_subscriptions")
        .upsert(
          {
            owner_kind: "staff",
            owner_id: profile.key,
            endpoint: subscription.endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            user_agent: navigator.userAgent.slice(0, 500),
          },
          { onConflict: "endpoint" },
        );
      if (saveError) {
        await subscription.unsubscribe().catch(() => false);
        throw new Error("The device was not saved to your account. Check your connection and try again.");
      }
      setDeviceState("enabled");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not enable device reminders. Try again.");
      setDeviceState("error");
    }
  }

  async function disableDevice() {
    if (!profile?.key || !registration) return;
    setErrorMessage(null);
    setDeviceState("busy");
    try {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const result = await requireSupabase()
          .from("push_subscriptions")
          .delete()
          .eq("owner_kind", "staff")
          .eq("owner_id", profile.key)
          .eq("endpoint", subscription.endpoint)
          .select("id");
        if (result.error || !result.data?.length) {
          throw new Error("Could not remove this device from your account. Try again.");
        }
        await subscription.unsubscribe();
      }
      setDeviceState("disabled");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not turn off device reminders. Try again.");
      setDeviceState("error");
    }
  }

  const enabled = deviceState === "enabled";
  const busy = deviceState === "checking" || deviceState === "busy";
  const supported = deviceState !== "unsupported";
  let buttonLabel = "Enable device reminders";
  if (busy) buttonLabel = "Checking…";
  else if (enabled) buttonLabel = "Turn off on this device";

  return (
    <Card>
      <CardHeader className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-md border bg-muted p-2 text-muted-foreground" aria-hidden="true">
            <BellRing />
          </div>
          <div className="min-w-0">
            <CardTitle role="heading" aria-level={2} className="flex flex-wrap items-center gap-2">
              Reminders on this device
              {enabled && (
                <Badge variant="secondary">
                  <Check data-icon="inline-start" /> Enabled
                </Badge>
              )}
              {deviceState === "denied" && <Badge variant="outline">Blocked by browser</Badge>}
            </CardTitle>
            <CardDescription className="mt-1">
              {enabled
                ? "Timed task and invited meeting alerts can reach this device while Palmstead is closed, if browser and operating-system notifications are allowed."
                : "Opt in to receive timed task and invited meeting alerts on this device, even when the schedule page is closed."}
            </CardDescription>
          </div>
        </div>
        {supported && (
          <CardAction className="col-auto row-auto justify-self-stretch sm:justify-self-end">
            <Button
              type="button"
              variant={enabled ? "outline" : "default"}
              disabled={busy || !profile?.key}
              onClick={enabled ? disableDevice : enableDevice}
              className="w-full shrink-0 sm:w-auto"
            >
              {enabled ? <Smartphone data-icon="inline-start" /> : <BellRing data-icon="inline-start" />}
              {buttonLabel}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-2 pt-0">
        <Button asChild variant="link" size="sm" className="h-auto w-fit px-0">
          <Link href="/dashboard/operations/reminders/mine">
            View my reminder activity <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
        {(deviceState === "denied" || deviceState === "unsupported" || errorMessage) && (
          <>
            {deviceState === "denied" && (
              <p className="text-muted-foreground text-sm">
                Allow notifications for Palmstead in your browser or device settings, then return here to enable them.
              </p>
            )}
            {deviceState === "unsupported" && (
              <p className="text-muted-foreground text-sm">
                This browser does not support background push. Scheduled task SMS is separate and follows the company’s
                Operations reminder policy.
              </p>
            )}
            {errorMessage && (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
