"use client";

import { useState } from "react";

import Link from "next/link";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useSessionStore } from "../../auth/useSessionStore";
import { getSupabaseClient } from "../../data/client";
import { type DigestDelivery, type DigestRun, digestTotals } from "../lib/salesDailyDigest";
import { buildSalesDailyDigestPdf } from "../lib/salesDailyDigestPdf";

const base = "/dashboard/pipeline/daily-reports";
const money = (value: number) =>
  `GHS ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const validPhone = (value: string | undefined) => /^(0\d{9}|233\d{9})$/.test((value ?? "").replace(/\D/g, ""));
function ghanaStamp(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-GB", {
        timeZone: "Africa/Accra",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}
function itemDetail(label: string, item: Record<string, unknown>): string {
  if (label.includes("Call"))
    return [item.outcome || "Outcome not recorded", ghanaStamp(item.at)].filter(Boolean).join(" · ");
  if (label.includes("lead")) return String(item.source || item.stage || "Source not recorded");
  if (label.includes("receipt")) return `${money(Number(item.amount ?? 0))}${item.receipt ? ` · ${item.receipt}` : ""}`;
  if (label.includes("visit") || label.includes("Visit"))
    return String(item.visitDate || item.time || item.status || "");
  if (label.includes("activity")) return String(item.action || "");
  if (label.includes("Follow")) return String(item.action || "");
  return String(ghanaStamp(item.completedAt) || item.dueDate || item.start || "");
}

async function loadRuns(): Promise<DigestRun[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error("The report service is unavailable.");
  const { data, error } = await client
    .from("sales_daily_digest_runs")
    .select("id,local_date,kind,generated_at,snapshot")
    .order("generated_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return (data ?? []) as DigestRun[];
}

async function loadRun(runId: string): Promise<DigestRun | null> {
  const client = getSupabaseClient();
  if (!client) throw new Error("The report service is unavailable.");
  const { data, error } = await client
    .from("sales_daily_digest_runs")
    .select("id,local_date,kind,generated_at,snapshot")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  return data as DigestRun | null;
}

async function loadDeliveries(runId: string): Promise<DigestDelivery[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error("The delivery service is unavailable.");
  const { data, error } = await client
    .from("sales_daily_digest_deliveries")
    .select("id,run_id,status,attempt_count,provider_accepted_at,last_error")
    .eq("run_id", runId);
  if (error) throw error;
  return (data ?? []) as DigestDelivery[];
}

type DigestSettings = { singleton: boolean; enabled: boolean; morning_time: string; evening_time: string };
async function loadSettings(): Promise<DigestSettings> {
  const client = getSupabaseClient();
  if (!client) throw new Error("The report settings are unavailable.");
  const { data, error } = await client
    .from("sales_daily_digest_settings")
    .select("singleton,enabled,morning_time,evening_time")
    .eq("singleton", true)
    .single();
  if (error || !data) throw error ?? new Error("No report settings found.");
  return data as DigestSettings;
}

export function SalesDailyDigestScreen({ runId }: { runId?: string }) {
  const profile = useSessionStore((state) => state.profile);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [morning, setMorning] = useState("08:00");
  const [evening, setEvening] = useState("18:00");
  const [editingTimes, setEditingTimes] = useState(false);
  const runs = useQuery({
    queryKey: ["salesDailyDigestRuns"],
    queryFn: loadRuns,
    enabled: profile?.role === "manager" && !runId,
  });
  const detail = useQuery({
    queryKey: ["salesDailyDigestRun", runId],
    queryFn: () => loadRun(runId ?? ""),
    enabled: profile?.role === "manager" && !!runId,
  });
  const settings = useQuery({
    queryKey: ["salesDailyDigestSettings"],
    queryFn: loadSettings,
    enabled: profile?.role === "manager" && !runId,
  });
  const deliveries = useQuery({
    queryKey: ["salesDailyDigestDeliveries", runId],
    queryFn: () => loadDeliveries(runId ?? ""),
    enabled: profile?.role === "manager" && !!runId,
  });
  const run = detail.data;

  async function saveSettings(enabled: boolean) {
    const client = getSupabaseClient();
    if (!client) return;
    setError(null);
    setBusy(true);
    const start = editingTimes ? morning : settings.data?.morning_time.slice(0, 5) || morning;
    const end = editingTimes ? evening : settings.data?.evening_time.slice(0, 5) || evening;
    if (start >= end) {
      setError("Morning must be earlier than evening.");
      setBusy(false);
      return;
    }
    if (enabled && !validPhone(profile?.phone)) {
      setError("Add a valid Ghana mobile number to your biodata in My settings before enabling SMS reports.");
      setBusy(false);
      return;
    }
    const { error: saveError } = await client
      .from("sales_daily_digest_settings")
      .update({ enabled, morning_time: start, evening_time: end, updated_at: new Date().toISOString() })
      .eq("singleton", true);
    if (saveError) setError(saveError.message);
    else {
      setEditingTimes(false);
      await queryClient.invalidateQueries({ queryKey: ["salesDailyDigestSettings"] });
    }
    setBusy(false);
  }

  async function retry(deliveryId: string) {
    const client = getSupabaseClient();
    if (!client) return;
    setError(null);
    const { error: retryError } = await client.rpc("requeue_sales_daily_digest_delivery", { p_delivery: deliveryId });
    if (retryError) setError(retryError.message);
    else await queryClient.invalidateQueries({ queryKey: ["salesDailyDigestDeliveries", runId] });
  }

  async function download() {
    if (!run || !profile) return;
    setBusy(true);
    setError(null);
    try {
      const pdf = await buildSalesDailyDigestPdf(run, profile.name);
      pdf.save(`Palmstead-daily-${run.kind}-${run.local_date}.pdf`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the PDF.");
    } finally {
      setBusy(false);
    }
  }

  if (profile?.role !== "manager") return <p className="p-4">Management access is required for daily reports.</p>;
  if ((!runId && runs.isLoading) || (runId && (detail.isLoading || deliveries.isLoading)))
    return <p className="p-4">Loading daily reports…</p>;
  if (runs.error || detail.error || deliveries.error)
    return (
      <p className="p-4 text-destructive">
        Could not load daily reports: {String(runs.error ?? detail.error ?? deliveries.error)}
      </p>
    );
  if (runId && !run) return <p className="p-4">This report is unavailable or you do not have access.</p>;

  if (!run)
    return (
      <div className="flex min-w-0 flex-col gap-5 pb-8">
        <Button asChild size="sm" variant="ghost" className="self-start">
          <Link href="/dashboard/pipeline/reports">
            <ArrowLeft /> Back to sales reports
          </Link>
        </Button>
        <div>
          <h1 className="font-semibold text-2xl">Daily Management reports</h1>
          <p className="text-muted-foreground">
            Morning plans and evening results are saved as dated snapshots. SMS contains a sign-in link, never client
            details.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Delivery schedule</CardTitle>
            <CardDescription>
              Ghana local time. A report is saved once per morning and evening; delivery status appears on each report.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!validPhone(profile?.phone) && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                Your Management biodata has no valid mobile number. Add one in{" "}
                <Link className="underline" href="/dashboard/settings">
                  My settings
                </Link>{" "}
                to receive these links.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label htmlFor="digest-morning-time" className="text-sm">
                Morning time
                <Input
                  id="digest-morning-time"
                  type="time"
                  className="mt-1"
                  value={editingTimes ? morning : settings.data?.morning_time.slice(0, 5) || morning}
                  onChange={(event) => {
                    setMorning(event.target.value);
                    setEditingTimes(true);
                  }}
                />
              </label>
              <label htmlFor="digest-evening-time" className="text-sm">
                Evening time
                <Input
                  id="digest-evening-time"
                  type="time"
                  className="mt-1"
                  value={editingTimes ? evening : settings.data?.evening_time.slice(0, 5) || evening}
                  onChange={(event) => {
                    setEvening(event.target.value);
                    setEditingTimes(true);
                  }}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Switch
                id="digest-enabled"
                checked={!!settings.data?.enabled}
                disabled={busy || (!settings.data?.enabled && !validPhone(profile?.phone))}
                onCheckedChange={(checked) => saveSettings(checked)}
              />
              <label htmlFor="digest-enabled" className="text-sm">
                Automatic twice-daily SMS reports
              </label>
              {editingTimes && (
                <Button size="sm" onClick={() => saveSettings(!!settings.data?.enabled)} disabled={busy}>
                  Save times
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saved reports</CardTitle>
            <CardDescription>Each link requires an active Management sign-in.</CardDescription>
          </CardHeader>
          <CardContent>
            {(runs.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No daily snapshots have been generated yet. They begin when automatic delivery is enabled.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Run</TableHead>
                      <TableHead>Captured</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.data?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.local_date}</TableCell>
                        <TableCell className="capitalize">{item.kind}</TableCell>
                        <TableCell>
                          {new Date(item.generated_at).toLocaleString("en-GB", { timeZone: "Africa/Accra" })}
                        </TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`${base}/${item.id}`}>Open report</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
    );

  const totals = digestTotals(run.snapshot);
  const morningRun = run.kind === "morning";
  return (
    <div className="flex min-w-0 flex-col gap-5 pb-8">
      <Button asChild size="sm" variant="ghost" className="self-start">
        <Link href={base}>
          <ArrowLeft /> Back to daily reports
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl">
            {morningRun ? "Morning plan" : "Evening results"} · {run.local_date}
          </h1>
          <p className="text-muted-foreground">
            Captured {new Date(run.generated_at).toLocaleString("en-GB", { timeZone: "Africa/Accra" })} Ghana time. This
            snapshot does not change when staff edit records later.
          </p>
        </div>
        <Button onClick={download} disabled={busy}>
          <Download /> Download PDF
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Staff", run.snapshot.staff.length],
          [morningRun ? "Tasks scheduled" : "Tasks completed", morningRun ? totals.tasks : totals.tasksCompleted],
          [morningRun ? "Follow-ups due" : "Genuine calls", morningRun ? totals.followUps : totals.calls],
          [morningRun ? "Visits scheduled" : "New leads", morningRun ? totals.visitsScheduled : totals.newLeads],
          ...(!morningRun ? [["Open today", totals.tasksOpenToday]] : []),
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      {!morningRun && (
        <Card>
          <CardHeader>
            <CardTitle>Approved client receipts</CardTitle>
            <CardDescription>Recorded payments only; not booked sales or bank-verified cash.</CardDescription>
          </CardHeader>
          <CardContent className="font-semibold text-2xl">
            {money(totals.approvedCash)}{" "}
            <span className="font-normal text-muted-foreground text-sm">from {totals.approvedReceipts} entries</span>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Staff activity</CardTitle>
          <CardDescription>
            Open each staff row to see tasks, follow-ups, calls, leads and visits recorded in this snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {run.snapshot.staff.map((person) => (
            <details key={person.key} className="rounded-md border p-3">
              <summary className="cursor-pointer font-medium">
                {person.name} ·{" "}
                {morningRun
                  ? `${person.tasks.length} tasks, ${person.followUps.length + person.leadNextActions.length} follow-ups`
                  : `${person.calls.length} calls, ${person.newLeads.length} leads, ${person.tasksCompletedToday.length} tasks done`}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(morningRun
                  ? [
                      ["Tasks", person.tasks, "title"],
                      ["Follow-ups", [...person.followUps, ...person.leadNextActions], "client"],
                      ["Site visits", person.visitsScheduled, "client"],
                      ["Calls logged so far", person.calls, "client"],
                      ["New leads so far", person.newLeads, "client"],
                      ["Approved receipts so far", person.approvedReceipts, "client"],
                    ]
                  : [
                      ["Calls", person.calls, "client"],
                      ["Other logged activity", person.otherActivity, "client"],
                      ["New leads", person.newLeads, "client"],
                      ["Visit requests", person.visitRequests, "client"],
                      ["Tasks completed", person.tasksCompletedToday, "title"],
                      ["Open today", person.tasks.filter((task) => task.status === "open"), "title"],
                      ["Older overdue tasks", person.tasksMissed, "title"],
                      ["Approved receipts", person.approvedReceipts, "client"],
                    ]
                ).map(([label, items, field]) => (
                  <div key={label as string} className="rounded-md bg-muted/40 p-3">
                    <h3 className="mb-2 font-semibold text-sm">
                      {label as string} ({(items as object[]).length})
                    </h3>
                    {(items as Record<string, unknown>[]).length ? (
                      <ul className="space-y-1 text-sm">
                        {(items as Record<string, unknown>[]).map((item) => (
                          <li key={String(item.id)} className="break-words">
                            {typeof item.leadId === "string" ||
                            ((label as string).includes("lead") && typeof item.id === "string") ? (
                              <Link
                                className="underline-offset-2 hover:underline"
                                href={`/dashboard/pipeline/${String(item.leadId || item.id)}`}
                              >
                                {String(item[field as string] || "Untitled")}
                              </Link>
                            ) : (
                              String(item[field as string] || "Untitled")
                            )}
                            {itemDetail(label as string, item) && (
                              <span className="block text-muted-foreground text-xs">
                                {itemDetail(label as string, item)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground text-sm">None recorded</p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>SMS delivery</CardTitle>
          <CardDescription>
            Only Management phone numbers from active biodata are used. An uncertain provider response requires review
            before resending.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(deliveries.data ?? []).map((delivery) => (
            <div
              key={delivery.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div>
                <span className="font-medium capitalize">{delivery.status.replaceAll("_", " ")}</span>
                {delivery.last_error && <p className="text-muted-foreground">{delivery.last_error}</p>}
                {delivery.provider_accepted_at && (
                  <p className="text-muted-foreground">
                    Accepted{" "}
                    {new Date(delivery.provider_accepted_at).toLocaleString("en-GB", { timeZone: "Africa/Accra" })}
                  </p>
                )}
              </div>
              {["failed", "blocked"].includes(delivery.status) && (
                <Button size="sm" variant="outline" onClick={() => retry(delivery.id)}>
                  <RefreshCw /> Retry
                </Button>
              )}
            </div>
          ))}
          {!deliveries.data?.length && (
            <p className="text-muted-foreground text-sm">
              No active Management recipients were found when this report was created.
            </p>
          )}
        </CardContent>
      </Card>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
