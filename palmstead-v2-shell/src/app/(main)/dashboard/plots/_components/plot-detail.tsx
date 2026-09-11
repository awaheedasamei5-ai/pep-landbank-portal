"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ghs } from "@/lib/palmstead/format";
import { type PlotStatus, useDeletePlot, usePlots, useSplitPlot, useUpdatePlot } from "@/lib/palmstead/use-plots";

const inputClass =
  "h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const labelClass = "text-xs font-medium text-muted-foreground";

// Subdivided excluded -- that's the split RPC's own real-only output,
// never a value staff sets by hand.
const PLOT_STATUSES: PlotStatus[] = [
  "Available",
  "Running Search",
  "Allocated",
  "Reserved",
  "Held for Approval",
  "Blocked",
  "Disputed",
  "Archived",
];

// Real port of web-next's PlotDetailScreen -- real edit (status/price/
// client/section/dimensions/notes via the real plots_upd RLS), real
// split-into-two-halves action (split_plot_for_half_sale RPC, only
// offered when eligible: Available, Full Plot, no parent), real subdivided-
// parent/sibling navigation, real hard-delete danger zone (plots has no
// soft-delete column, matching production exactly).
export function PlotDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: plots, isLoading } = usePlots();
  const update = useUpdatePlot();
  const del = useDeletePlot();
  const split = useSplitPlot();

  const plot = (plots ?? []).find((p) => p.id === id) ?? null;
  const parent = plot?.parentPlotId ? ((plots ?? []).find((p) => p.id === plot.parentPlotId) ?? null) : null;
  const siblings = plot
    ? (plots ?? []).filter(
        (p) =>
          p.parentPlotId === plot.id || (plot.parentPlotId && p.parentPlotId === plot.parentPlotId && p.id !== plot.id),
      )
    : [];

  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<PlotStatus>("Available");
  const [price, setPrice] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [notes, setNotes] = useState("");
  const [section, setSection] = useState("");
  const [widthFt, setWidthFt] = useState("");
  const [lengthFt, setLengthFt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"split" | "delete" | null>(null);

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!plot) return <p className="text-muted-foreground text-sm">Plot not found.</p>;

  const canSplit = plot.status === "Available" && plot.plotType === "Full Plot" && !plot.parentPlotId;

  function startEdit() {
    if (!plot) return;
    setStatus(plot.status === "Subdivided" ? "Available" : plot.status);
    setPrice(plot.price != null ? String(plot.price) : "");
    setClientName(plot.clientName ?? "");
    setClientContact(plot.clientContact ?? "");
    setNotes(plot.notes ?? "");
    setSection(plot.section ?? "");
    setWidthFt(plot.widthFt != null ? String(plot.widthFt) : "");
    setLengthFt(plot.lengthFt != null ? String(plot.lengthFt) : "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!plot) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: plot.id,
        patch: {
          status,
          price: price ? Number(price) : null,
          clientName: clientName || null,
          clientContact: clientContact || null,
          notes: notes || null,
          section: section.trim() || null,
          widthFt: widthFt ? Number(widthFt) : null,
          lengthFt: lengthFt ? Number(lengthFt) : null,
        },
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => router.push("/dashboard/plots")}
      >
        ← Back
      </Button>

      <div>
        <div className="text-muted-foreground text-xs">{plot.site}</div>
        <h1 className="font-semibold text-2xl tracking-tight">{plot.plotNumber}</h1>
        <p className="text-muted-foreground text-sm">
          {plot.plotType}
          {plot.widthFt != null && plot.lengthFt != null ? ` · ${plot.widthFt}×${plot.lengthFt}ft` : ""}
          {plot.areaSqft != null ? ` · ${plot.areaSqft.toLocaleString()} sqft` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-muted-foreground text-xs">Status</div>
            <div className="font-semibold text-xl">{plot.status}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-muted-foreground text-xs">Price</div>
            <div className="font-semibold text-xl tabular-nums">{plot.price != null ? ghs(plot.price) : "—"}</div>
          </CardContent>
        </Card>
      </div>

      {plot.status === "Subdivided" && (
        <Card>
          <CardHeader>
            <CardTitle>Split into two halves</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              This plot has been split into {siblings.map((s) => s.plotNumber).join(" and ")} — manage each half
              separately.
            </p>
            {siblings.map((s) => (
              <button
                key={s.id}
                type="button"
                className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
                onClick={() => router.push(`/dashboard/plots/${s.id}`)}
              >
                <span>{s.plotNumber}</span>
                <Badge variant="outline">{s.status}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {parent && (
        <p className="text-muted-foreground text-sm">
          Half of {parent.plotNumber} — the other half is{" "}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => router.push(`/dashboard/plots/${parent.id}`)}
          >
            {siblings[0]?.plotNumber ?? "nearby"}
          </Button>
          .
        </p>
      )}

      {plot.status !== "Subdivided" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Allocation
                {!editing && (
                  <Button type="button" variant="ghost" size="sm" onClick={startEdit}>
                    Edit plot details
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!editing ? (
                <div className="text-sm">
                  <div className={labelClass}>Client</div>
                  <div>{plot.clientName || "—"}</div>
                  {plot.clientContact && <div className="text-muted-foreground text-xs">{plot.clientContact}</div>}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      className={inputClass}
                      value={status}
                      onChange={(e) => setStatus(e.target.value as PlotStatus)}
                    >
                      {PLOT_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <input
                      className={inputClass}
                      type="number"
                      placeholder="Price (GHS)"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className={inputClass}
                      placeholder="Client name"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                    />
                    <input
                      className={inputClass}
                      placeholder="Client contact"
                      value={clientContact}
                      onChange={(e) => setClientContact(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <input
                      className={inputClass}
                      placeholder="Section/block"
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                    />
                    <input
                      className={inputClass}
                      type="number"
                      placeholder="Width (ft)"
                      value={widthFt}
                      onChange={(e) => setWidthFt(e.target.value)}
                    />
                    <input
                      className={inputClass}
                      type="number"
                      placeholder="Length (ft)"
                      value={lengthFt}
                      onChange={(e) => setLengthFt(e.target.value)}
                    />
                  </div>
                  <textarea
                    className={`${inputClass} h-20 py-2`}
                    placeholder="Notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  {error && <p className="text-destructive text-sm">{error}</p>}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button type="button" className="flex-1" disabled={update.isPending} onClick={save}>
                      {update.isPending ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {plot.notes && !editing && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">{plot.notes}</p>
              </CardContent>
            </Card>
          )}

          {canSplit && !editing && (
            <Card>
              <CardHeader>
                <CardTitle>Need to sell this as two Half Plots instead?</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">
                  Splits {plot.plotNumber} into {plot.plotNumber}a and {plot.plotNumber}b — two separate Half Plot
                  units, both Available.
                </p>
                {confirming === "split" ? (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={split.isPending}
                      onClick={() => split.mutateAsync(plot.id).then(() => setConfirming(null))}
                    >
                      {split.isPending ? "Splitting…" : "Yes, split it"}
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setConfirming("split")}>
                    Split into {plot.plotNumber}a / {plot.plotNumber}b
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          {confirming === "delete" ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-sm">
                Remove plot {plot.plotNumber} from inventory entirely? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1"
                  disabled={del.isPending}
                  onClick={() => del.mutateAsync(plot.id).then(() => router.push("/dashboard/plots"))}
                >
                  {del.isPending ? "Deleting…" : "Yes, delete it"}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="destructive" onClick={() => setConfirming("delete")}>
              Delete plot
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
