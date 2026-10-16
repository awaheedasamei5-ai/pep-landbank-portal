"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, History, RotateCcw, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";

import {
  executeOperationsReset,
  impactLabels,
  listOperationsResets,
  previewOperationsReset,
  type ResetBatch,
  type ResetScope,
  resetDate,
  resetScopes,
  restoreOperationsReset,
  totalResetRecords,
} from "./operations-reset-data";

function Impact({ batch }: { batch: ResetBatch }) {
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-x-6 sm:grid-cols-2">
      {Object.entries(batch.counts).map(([table, count]) => (
        <div key={table} className="flex min-w-0 items-start justify-between gap-3 border-b py-2 text-sm">
          <dt className="min-w-0 break-words text-muted-foreground">{impactLabels[table] ?? table}</dt>
          <dd className="shrink-0 font-medium tabular-nums">{count.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

function failure(error: unknown) {
  return error instanceof Error ? error.message : "The request failed. Check the recovery history before trying again.";
}

export function OperationsResetScreen() {
  const profile = useAuthStore((state) => state.profile);
  const allowed = profile?.role === "manager" && profile.active;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ResetScope[]>([]);
  const [reason, setReason] = useState("");
  const [batch, setBatch] = useState<ResetBatch | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{ mode: "reset" | "restore"; batch: ResetBatch } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<ResetBatch | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const before = cursors[cursors.length - 1];
  const historyKey = ["operations-reset-history", profile?.key];
  const history = useQuery({
    queryKey: [...historyKey, before],
    queryFn: () => listOperationsResets(before),
    enabled: Boolean(allowed),
    staleTime: 0,
  });
  const preview = useMutation({
    mutationFn: () => previewOperationsReset(selected, reason.trim()),
    onSuccess: (data) => {
      setBatch(data.batch);
      setBlockers(data.blockers);
      setResult(null);
    },
  });
  const change = useMutation({
    mutationFn: async ({ mode, target, phrase }: { mode: "reset" | "restore"; target: ResetBatch; phrase: string }) =>
      mode === "reset" ? executeOperationsReset(target.id, phrase) : restoreOperationsReset(target.id, phrase),
    onSuccess: (data) => {
      setResult(data);
      setDialog(null);
      setConfirmation("");
      setBatch(null);
      setCursors([null]);
      void queryClient.invalidateQueries({ queryKey: historyKey });
    },
    // A timeout can happen after a commit. Never retry a destructive call automatically.
    retry: false,
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: historyKey });
    },
  });
  useEffect(() => {
    if (!batch) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [batch]);

  function invalidatePreview() {
    setBatch(null);
    setBlockers([]);
    preview.reset();
    setResult(null);
  }
  function openConfirmation(mode: "reset" | "restore", target: ResetBatch) {
    change.reset();
    setConfirmation("");
    setDialog({ mode, batch: target });
  }
  const expired = batch ? new Date(batch.expires_at).getTime() <= now : false;
  const phrase = dialog?.mode === "restore" ? "RESTORE OPERATIONS" : "RESET OPERATIONS";
  const pending = change.isPending || preview.isPending;
  const actionLabel = dialog?.mode === "restore" ? "Restore records" : "Reset selected data";

  return (
    <div className="min-w-0 space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link href="/dashboard/operations">
          <ArrowLeft aria-hidden="true" />
          Back to Operations
        </Link>
      </Button>
      <PageHeader
        title="Reset Operations test data"
        description="Management controls · preview, clear selected work and recover a reset."
      />
      {!allowed ? (
        <Card>
          <CardContent className="pt-6">
            <h2 className="font-semibold">Management access required</h2>
            <p className="mt-2 text-muted-foreground text-sm">Staff cannot preview, reset or restore company data.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
                Company setup stays
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-muted-foreground text-sm">
              <p>
                Staff accounts, bio data, company settings and the Operations workspace are retained. Accounting, Leave,
                Attendance, CRM and private messages are outside this reset.
              </p>
              <p>
                Attachment files stay in private storage; their app records are included in recovery. Existing reset
                history and recovery snapshots are retained.
              </p>
              <p>
                Open Operations screens will ask staff to reload after a reset or recovery. Unsent past reminders are
                suppressed when records are restored; future reminders remain eligible.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>1. Choose what to clear</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid min-w-0 gap-3 lg:grid-cols-3">
                {resetScopes.map((scope) => (
                  <label
                    key={scope.key}
                    htmlFor={`scope-${scope.key}`}
                    className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-4 has-aria-checked:bg-muted/50"
                  >
                    <Checkbox
                      id={`scope-${scope.key}`}
                      checked={selected.includes(scope.key)}
                      disabled={pending}
                      className="mt-1"
                      onCheckedChange={(checked) => {
                        invalidatePreview();
                        setSelected((old) =>
                          checked === true ? [...old, scope.key] : old.filter((value) => value !== scope.key),
                        );
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-sm">{scope.title}</span>
                      <span className="mt-1 block text-muted-foreground text-sm">{scope.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-reason">Reason for reset</Label>
                <Textarea
                  id="reset-reason"
                  maxLength={500}
                  value={reason}
                  disabled={pending}
                  placeholder="For example: clear the trial projects before company launch"
                  onChange={(event) => {
                    setReason(event.target.value);
                    invalidatePreview();
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  Recorded in Management recovery history. Do not include passwords or sensitive personal details.
                </p>
              </div>
              <Button
                onClick={() => preview.mutate()}
                disabled={pending || selected.length === 0 || reason.trim().length < 3}
              >
                {preview.isPending ? "Preparing preview…" : "Preview reset impact"}
              </Button>
              {preview.isError && (
                <p role="alert" className="break-words text-destructive text-sm">
                  {failure(preview.error)}
                </p>
              )}
              {blockers.length > 0 && (
                <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-4">
                  <h3 className="font-medium">Resolve these dependencies first</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {blockers.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
          {batch && (
            <Card>
              <CardHeader>
                <CardTitle>2. Review the impact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">
                  <strong>{totalResetRecords(batch).toLocaleString()} related records</strong> across the selected
                  scopes. This includes child records; it is not a count of tasks alone.
                </p>
                <Impact batch={batch} />
                <p className="text-muted-foreground text-sm">
                  Previewed {resetDate(batch.created_at)} · expires {resetDate(batch.expires_at)} (Ghana time). Changes
                  to this data invalidate the preview.
                </p>
                {expired && (
                  <p role="status" className="text-destructive text-sm">
                    Preview expired. Prepare a new preview before continuing.
                  </p>
                )}
                {totalResetRecords(batch) === 0 && (
                  <p role="status" className="text-muted-foreground text-sm">
                    These scopes are already empty. Nothing needs to be reset.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    disabled={expired || pending || totalResetRecords(batch) === 0}
                    onClick={() => openConfirmation("reset", batch)}
                  >
                    Continue to confirmation
                  </Button>
                  <Button variant="outline" onClick={invalidatePreview} disabled={pending}>
                    Discard preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {result && (
            <div role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">
              {result.status === "restored" ? "Recovery completed." : "Reset completed."} Review the batch below.
              Operations screens may request a reload.
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-5 shrink-0" aria-hidden="true" />
                Reset and recovery history
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm">
                  Recover a completed reset without overwriting newer work.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={history.isFetching}
                  onClick={() => {
                    void history.refetch();
                  }}
                >
                  Refresh history
                </Button>
              </div>
              {history.isPending && <p className="text-muted-foreground text-sm">Loading recovery history…</p>}
              {history.isError && (
                <p role="alert" className="break-words text-destructive text-sm">
                  {failure(history.error)}
                </p>
              )}
              {history.data?.batches.length === 0 && (
                <p className="rounded-lg border border-dashed p-5 text-muted-foreground text-sm">
                  No completed resets on this page. Preparing a preview does not clear any records.
                </p>
              )}
              {history.data?.batches.map((entry) => (
                <article key={entry.id} className="min-w-0 space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-medium">
                        {entry.status === "restored" ? "Recovered" : "Reset completed"} ·{" "}
                        {entry.scopes.map((scope) => resetScopes.find((item) => item.key === scope)?.title).join(", ")}
                      </h3>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {entry.actor_name} · {resetDate(entry.executed_at ?? entry.created_at)} (Ghana time)
                      </p>
                    </div>
                    {entry.status === "executed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => openConfirmation("restore", entry)}
                      >
                        <RotateCcw aria-hidden="true" />
                        Restore records
                      </Button>
                    )}
                  </div>
                  <p className="break-words text-sm">{entry.reason}</p>
                  <p className="text-muted-foreground text-sm">
                    {totalResetRecords(entry).toLocaleString()} related records ·{" "}
                    <span className="break-all">Batch {entry.id}</span>
                  </p>
                  <details>
                    <summary className="cursor-pointer text-sm underline underline-offset-4">
                      Impact and recorded actions
                    </summary>
                    <div className="mt-3 space-y-3">
                      <Impact batch={entry} />
                      <ul className="space-y-1 text-muted-foreground text-xs">
                        {entry.events.map((event) => (
                          <li key={`${event.action}-${event.created_at}`}>
                            {event.action} · {event.actor_name} · {resetDate(event.created_at)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                </article>
              ))}
              <div className="flex flex-wrap gap-2">
                {cursors.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={history.isFetching}
                    onClick={() => setCursors((old) => old.slice(0, -1))}
                  >
                    Newer resets
                  </Button>
                )}
                {history.data?.has_more && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={history.isFetching}
                    onClick={() => {
                      const last = history.data.batches.at(-1);
                      if (last) setCursors((old) => [...old, last.created_at]);
                    }}
                  >
                    Older resets
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          <Dialog
            open={dialog !== null}
            onOpenChange={(open) => {
              if (!open && !change.isPending) {
                setDialog(null);
                setConfirmation("");
              }
            }}
          >
            <DialogContent
              className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
              onEscapeKeyDown={(event) => {
                if (change.isPending) event.preventDefault();
              }}
              onInteractOutside={(event) => {
                if (change.isPending) event.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {dialog?.mode === "restore" ? "Restore Operations records" : "Confirm Operations reset"}
                </DialogTitle>
                <DialogDescription>
                  {dialog?.mode === "restore"
                    ? "Original IDs and linked records will be recovered. Conflicts stop the whole recovery and keep the snapshot available."
                    : "This clears the selected company work for all staff. A protected recovery snapshot is saved in the same transaction. Accounts and company setup stay."}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm">
                {dialog ? totalResetRecords(dialog.batch).toLocaleString() : 0} related records. Open Operations screens
                will request a reload.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reset-confirmation">
                  Type <strong>{phrase}</strong> to continue
                </Label>
                <Input
                  id="reset-confirmation"
                  value={confirmation}
                  autoComplete="off"
                  disabled={change.isPending}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
              {dialog?.mode === "reset" && new Date(dialog.batch.expires_at).getTime() <= now && (
                <p role="alert" className="text-destructive text-sm">
                  This preview expired. Cancel and prepare a new preview.
                </p>
              )}
              {change.isError && (
                <div role="alert" className="space-y-2 text-sm">
                  <p className="break-words text-destructive">{failure(change.error)}</p>
                  <p className="text-muted-foreground">
                    If the connection timed out, close this dialog and refresh history to check whether it completed.
                    Retrying uses the same protected batch.
                  </p>
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button variant="outline" disabled={change.isPending} onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  variant={dialog?.mode === "reset" ? "destructive" : "default"}
                  disabled={
                    change.isPending ||
                    confirmation !== phrase ||
                    (dialog?.mode === "reset" && new Date(dialog.batch.expires_at).getTime() <= now)
                  }
                  onClick={() => {
                    if (dialog) change.mutate({ mode: dialog.mode, target: dialog.batch, phrase: confirmation });
                  }}
                >
                  {change.isPending ? "Processing…" : actionLabel}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
