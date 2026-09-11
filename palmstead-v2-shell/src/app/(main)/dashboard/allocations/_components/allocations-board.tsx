"use client";

import { useState } from "react";

import {
  allocationUnitsNeeded,
  type PlotSuggestion,
  suggestAlternatives,
  suggestSet,
} from "@/lib/palmstead/allocation-suggestion-engine";
import { ghs } from "@/lib/palmstead/format";
import {
  type AllocationRequestRow,
  useAllocationRequests,
  useCanAllocatePlots,
  useConfirmAllocation,
  useCreateAllocationRequest,
  useDeleteAllocationRequest,
  useEditAllocatedPlot,
  useFlagAllocation,
  useResolveAllocationFlag,
  useRevertAllocation,
  useSendBackAllocation,
  useSuggestAllocationPlots,
} from "@/lib/palmstead/use-allocation-requests";
import { useAppConfig } from "@/lib/palmstead/use-app-config";
import { usePipelineLeads } from "@/lib/palmstead/use-pipeline-leads";
import { type PlotType, usePlots } from "@/lib/palmstead/use-plots";
import { useAuthStore } from "@/stores/auth/auth-store";

// Allocations -- the real 3-stage workflow (Pending -> staff suggest
// candidates -> Awaiting Authorization -> Management confirms -> Allocated,
// the only point the real `plots` table gets synced), direct port of
// web-next's AllocationRequestsScreen against the same real RPCs
// (confirm_allocation/revert_allocation/delete_allocation, all SECURITY
// DEFINER), plus the flag/fix-resubmit side path at the suggest stage and
// editing an already-allocated plot's number (edit_allocated_plot RPC).
// Honestly not yet ported, this is real scope -- flagged, not hidden: the
// physical-authorization-photo upload + AI verification gate, PDF
// generation, and the in-panel plot-split action. Confirm works without a
// photo attached for now. The deposit-eligibility check below is also a
// real simplification: it compares paid against grandTotal directly
// rather than porting the full quotation-net-total engine -- close
// enough for a first real pass, not byte-identical to web-next's
// computeDepositStatus.
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function AllocationsBoard() {
  const { data: requests, isLoading } = useAllocationRequests();
  const canAllocate = useCanAllocatePlots();
  const [showForm, setShowForm] = useState(false);

  const pending = (requests ?? [])
    .filter((r) => r.status === "Pending")
    .sort((a, b) => (b.percentPaid ?? 0) - (a.percentPaid ?? 0));
  const awaiting = (requests ?? [])
    .filter((r) => r.status === "Awaiting Authorization")
    .sort((a, b) => (b.percentPaid ?? 0) - (a.percentPaid ?? 0));
  const allocated = (requests ?? [])
    .filter((r) => r.status === "Allocated")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Allocations</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? "Loading…" : `${pending.length} awaiting suggestion · ${awaiting.length} awaiting sign-off`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm"
        >
          {showForm ? "Cancel" : "+ Request allocation"}
        </button>
      </div>

      {showForm && <NewRequestForm onDone={() => setShowForm(false)} />}

      <Section
        title="Pending"
        empty="Nothing pending. Clients appear here automatically once they cross the deposit threshold."
      >
        {pending.map((r) => (
          <RequestRow key={r.id} request={r} canAllocate={canAllocate} />
        ))}
      </Section>
      <Section title="Awaiting Management sign-off" empty="None right now.">
        {awaiting.map((r) => (
          <RequestRow key={r.id} request={r} canAllocate={canAllocate} />
        ))}
      </Section>
      <Section title="Already allocated" empty="No allocations yet.">
        {allocated.map((r) => (
          <RequestRow key={r.id} request={r} canAllocate={canAllocate} />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div>
      <div className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">{title}</div>
      <div className="flex flex-col gap-2">
        {!hasChildren && <p className="text-muted-foreground text-sm">{empty}</p>}
        {children}
      </div>
    </div>
  );
}

function NewRequestForm({ onDone }: { onDone: () => void }) {
  const { data: leads } = usePipelineLeads();
  const { data: config } = useAppConfig();
  const create = useCreateAllocationRequest();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const matches = q
    ? (leads ?? []).filter((l) => l.name.toLowerCase().includes(q) || l.contact.includes(q)).slice(0, 8)
    : [];
  const selectedLead = (leads ?? []).find((l) => l.id === selectedId) ?? null;

  const threshold = config?.allocationThresholdPct ?? 30;
  const target = selectedLead ? Math.round(selectedLead.grandTotal * (threshold / 100)) : 0;
  const eligible = !!selectedLead && selectedLead.amtPaid >= target;

  async function submit() {
    if (!selectedId || !eligible) return;
    await create.mutateAsync(selectedId);
    onDone();
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      {!selectedLead ? (
        <>
          <input
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Search your clients by name or contact…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {matches.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedId(l.id)}
                  className="rounded-lg border bg-background p-2.5 text-left text-sm hover:bg-muted"
                >
                  <div className="font-medium">{l.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {l.contact} · {ghs(l.amtPaid)} of {ghs(l.grandTotal)} paid
                  </div>
                </button>
              ))}
            </div>
          )}
          {q && matches.length === 0 && (
            <p className="mt-2 text-muted-foreground text-xs">No clients match &quot;{query}&quot;.</p>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-sm">{selectedLead.name}</div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded-full border px-2.5 py-1 text-muted-foreground text-xs"
            >
              Change
            </button>
          </div>
          {!eligible && (
            <p className="mt-2 text-amber-600 text-xs dark:text-amber-400">
              {ghs(selectedLead.amtPaid)} of {ghs(target)} ({threshold}% target) paid —{" "}
              {ghs(Math.max(target - selectedLead.amtPaid, 0))} more needed before this client is eligible for
              allocation.
            </p>
          )}
          <button
            type="button"
            disabled={!eligible || create.isPending}
            onClick={submit}
            className="mt-3 w-full rounded-full bg-primary py-2.5 font-semibold text-primary-foreground text-sm disabled:opacity-50"
          >
            {create.isPending ? "Sending…" : "Send request"}
          </button>
        </>
      )}
    </div>
  );
}

function StatusPill({ status, plotNumber }: { status: AllocationRequestRow["status"]; plotNumber: string | null }) {
  if (status === "Allocated") {
    return (
      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 text-xs dark:bg-emerald-500/15 dark:text-emerald-300">
        Plot {plotNumber}
      </span>
    );
  }
  if (status === "Awaiting Authorization") {
    return (
      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-700 text-xs dark:bg-amber-500/15 dark:text-amber-300">
        Awaiting sign-off
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground text-xs">
      Pending
    </span>
  );
}

function RequestRow({ request, canAllocate }: { request: AllocationRequestRow; canAllocate: boolean }) {
  const profile = useAuthStore((s) => s.profile);
  const isOwnAgent = profile?.key === request.agentKey;
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-left">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
          {initials(request.clientName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">{request.clientName}</div>
          <div className="truncate text-muted-foreground text-xs">
            {request.agentName} · {request.percentPaid ?? 0}% paid ({ghs(request.amtPaid ?? 0)} of{" "}
            {ghs(request.grandTotal ?? 0)})
          </div>
        </div>
        <StatusPill status={request.status} plotNumber={request.plotNumber} />
      </button>

      {request.flagReason && (
        <div className="mt-2 rounded-lg bg-red-50 p-2 text-red-700 text-xs dark:bg-red-500/10 dark:text-red-300">
          ⚠ {request.flagReason}
        </div>
      )}

      {open && (
        <div className="mt-3 border-t pt-3">
          {request.status === "Pending" && request.flagReason && isOwnAgent && <FixResubmit request={request} />}
          {request.status === "Pending" && request.flagReason && !isOwnAgent && canAllocate && (
            <p className="text-muted-foreground text-xs">Waiting on {request.agentName} to fix and resubmit.</p>
          )}
          {request.status === "Pending" && !request.flagReason && canAllocate && <SuggestPanel request={request} />}
          {request.status === "Awaiting Authorization" && canAllocate && <AwaitingPanel request={request} />}
          {request.status === "Allocated" && canAllocate && <AllocatedPanel request={request} />}
        </div>
      )}
    </div>
  );
}

function FixResubmit({ request }: { request: AllocationRequestRow }) {
  const resolveFlag = useResolveAllocationFlag();
  return (
    <button
      type="button"
      disabled={resolveFlag.isPending}
      onClick={() => resolveFlag.mutate(request.id)}
      className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm disabled:opacity-50"
    >
      {resolveFlag.isPending ? "Notifying…" : "I've fixed this — notify for re-review"}
    </button>
  );
}

function SuggestPanel({ request }: { request: AllocationRequestRow }) {
  const { data: plots } = usePlots();
  const { data: config } = useAppConfig();
  const { data: leads } = usePipelineLeads();
  const suggest = useSuggestAllocationPlots();
  const flag = useFlagAllocation();
  const [values, setValues] = useState<string[]>(["", "", ""]);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [flagReasonText, setFlagReasonText] = useState("");

  const lead = (leads ?? []).find((l) => l.id === request.leadId) ?? null;
  const units = allocationUnitsNeeded(lead?.noPlots ?? 1);
  const multi = units.length > 1;
  const slots = multi ? units.length : 3;
  const std = {
    fullWidthFt: config?.techFullPlotWidthFt ?? 70,
    fullLengthFt: config?.techFullPlotLengthFt ?? 100,
    halfWidthFt: config?.techHalfPlotWidthFt ?? 50,
    halfLengthFt: config?.techHalfPlotLengthFt ?? 70,
  };

  function autoSuggest() {
    if (!plots) return;
    const nextReasons: Record<number, string> = {};
    if (multi) {
      const set = suggestSet(plots, units, std);
      setValues((v) => v.map((_, i) => set[i]?.plot.plotNumber ?? ""));
      set.forEach((s: PlotSuggestion | null, i: number) => {
        if (s) nextReasons[i] = s.reason;
      });
    } else {
      const alts = suggestAlternatives(plots, (lead?.plotType as PlotType | undefined) ?? "Full Plot", std);
      setValues((v) => v.map((_, i) => alts[i]?.plot.plotNumber ?? ""));
      alts.forEach((s, i) => {
        nextReasons[i] = s.reason;
      });
    }
    setReasons(nextReasons);
  }

  function statusFor(v: string): { className: string; text: string } | null {
    const pn = v.trim();
    if (!pn) return null;
    const p = (plots ?? []).find((x) => x.plotNumber.toLowerCase() === pn.toLowerCase());
    if (!p) return { className: "text-muted-foreground", text: "Not found in inventory — check the plot number" };
    if (p.status === "Allocated")
      return {
        className: "text-red-600 dark:text-red-400",
        text: `✕ Already allocated${p.clientName ? ` to ${p.clientName}` : ""}`,
      };
    if (p.status === "Subdivided")
      return {
        className: "text-amber-600 dark:text-amber-400",
        text: `This plot has already been split — pick a real child plot instead`,
      };
    if (p.status === "Running Search")
      return {
        className: "text-amber-600 dark:text-amber-400",
        text: "⚠ Running search — confirm before offering this one",
      };
    return { className: "text-emerald-600 dark:text-emerald-400", text: "✓ Available" };
  }

  async function submit() {
    setError(null);
    const plotNumbers = values
      .slice(0, slots)
      .map((v) => v.trim())
      .filter(Boolean);
    if (multi && plotNumbers.length < units.length) {
      setError(
        `This client needs ${units.length} plot(s) — fill in all ${units.length} required unit${units.length === 1 ? "" : "s"} before continuing.`,
      );
      return;
    }
    if (!multi && plotNumbers.length === 0) {
      setError("Enter at least one candidate plot");
      return;
    }
    try {
      await suggest.mutateAsync({ id: request.id, plotNumbers });
    } catch {
      setError("Failed to suggest plots");
    }
  }

  if (flagging) {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor="allocation-flag-reason" className="font-semibold text-xs">
          What&apos;s wrong with this request?
        </label>
        <textarea
          id="allocation-flag-reason"
          className="min-h-16 rounded-md border bg-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={flagReasonText}
          onChange={(e) => setFlagReasonText(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!flagReasonText.trim() || flag.isPending}
            onClick={() =>
              flag.mutateAsync({ id: request.id, reason: flagReasonText.trim() }).then(() => setFlagging(false))
            }
            className="rounded-full bg-red-600 px-4 py-2 font-semibold text-sm text-white disabled:opacity-50"
          >
            {flag.isPending ? "Sending…" : "Send & flag"}
          </button>
          <button
            type="button"
            onClick={() => setFlagging(false)}
            className="rounded-full border px-4 py-2 font-semibold text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        {multi
          ? `This client is buying ${units.length} units (${units.join(" + ")}). Suggest exactly one plot per unit.`
          : "Suggest up to 3 candidate plots. Management signs off before anything is allocated."}
      </p>
      <button
        type="button"
        onClick={autoSuggest}
        className="self-start rounded-full border px-3 py-1.5 font-semibold text-xs"
      >
        ✨ Auto-suggest from inventory
      </button>
      {Array.from({ length: slots }).map((_, i) => {
        const st = statusFor(values[i]);
        let placeholder: string;
        if (multi) placeholder = `${units[i]} ${i + 1}`;
        else if (i === 0) placeholder = "e.g. A12";
        else placeholder = "optional";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: these are fixed-position candidate slots (unit 1/2/3), never reordered or inserted/removed mid-list.
          <div key={`slot-${i}`}>
            <input
              className="h-8 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={placeholder}
              value={values[i]}
              onChange={(e) => {
                const val = e.target.value;
                setValues((v) => v.map((x, idx) => (idx === i ? val : x)));
                setReasons((r) => ({ ...r, [i]: "" }));
              }}
            />
            {reasons[i] && <div className="mt-0.5 text-[11px] text-muted-foreground">{reasons[i]}</div>}
            {st && <div className={`mt-0.5 text-[11px] ${st.className}`}>{st.text}</div>}
          </div>
        );
      })}
      {error && <p className="text-red-600 text-xs dark:text-red-400">{error}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={suggest.isPending}
          onClick={submit}
          className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm disabled:opacity-50"
        >
          {suggest.isPending ? "Sending…" : "Suggest plots →"}
        </button>
        <button
          type="button"
          onClick={() => setFlagging(true)}
          className="rounded-full border px-4 py-2 font-semibold text-sm"
        >
          Flag an issue
        </button>
      </div>
    </div>
  );
}

function AwaitingPanel({ request }: { request: AllocationRequestRow }) {
  const confirm = useConfirmAllocation();
  const sendBack = useSendBackAllocation();
  const [selected, setSelected] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const plots = (request.suggestedPlots ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (sendingBack) {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor="allocation-send-back-reason" className="font-semibold text-xs">
          Why is this being sent back?
        </label>
        <textarea
          id="allocation-send-back-reason"
          className="min-h-16 rounded-md border bg-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && <p className="text-red-600 text-xs dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!reason.trim() || sendBack.isPending}
            onClick={() =>
              sendBack.mutateAsync({ id: request.id, reason: reason.trim() }).then(
                () => setSendingBack(false),
                () => setError("Failed to send back"),
              )
            }
            className="rounded-full bg-red-600 px-4 py-2 font-semibold text-white text-sm disabled:opacity-50"
          >
            {sendBack.isPending ? "Sending back…" : "Send back to staff"}
          </button>
          <button
            type="button"
            onClick={() => setSendingBack(false)}
            className="rounded-full border px-4 py-2 font-semibold text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">Pick the plot Management approved.</p>
      {plots.map((pn) => (
        <label key={pn} className="flex items-center gap-2 text-sm">
          <input type="radio" name={`al_${request.id}`} checked={selected === pn} onChange={() => setSelected(pn)} />{" "}
          <span className="font-semibold">Plot {pn}</span>
        </label>
      ))}
      {error && <p className="text-red-600 text-xs dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!selected || confirm.isPending}
          onClick={() =>
            selected &&
            confirm
              .mutateAsync({ id: request.id, plotNumber: selected, note: "Approved via signed authorization form" })
              .catch(() => setError("Failed to confirm"))
          }
          className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm disabled:opacity-50"
        >
          {confirm.isPending ? "Confirming…" : "Confirm approved plot"}
        </button>
        <button
          type="button"
          onClick={() => setSendingBack(true)}
          className="rounded-full border px-4 py-2 font-semibold text-sm"
        >
          Send back
        </button>
      </div>
    </div>
  );
}

function AllocatedPanel({ request }: { request: AllocationRequestRow }) {
  const revert = useRevertAllocation();
  const remove = useDeleteAllocationRequest();
  const editPlot = useEditAllocatedPlot();
  const [confirming, setConfirming] = useState<"undo" | "delete" | "edit" | null>(null);
  const [newPlotNumber, setNewPlotNumber] = useState(request.plotNumber ?? "");
  const [editError, setEditError] = useState<string | null>(null);

  if (confirming === "edit") {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={`allocation-edit-plot-${request.id}`} className="font-semibold text-xs">
          Correct the allocated plot number
        </label>
        <input
          id={`allocation-edit-plot-${request.id}`}
          className="h-9 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={newPlotNumber}
          onChange={(e) => setNewPlotNumber(e.target.value)}
        />
        {editError && <p className="text-red-600 text-xs dark:text-red-400">{editError}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!newPlotNumber.trim() || editPlot.isPending}
            onClick={() =>
              editPlot.mutateAsync({ id: request.id, plotNumber: newPlotNumber.trim() }).then(
                () => setConfirming(null),
                () => setEditError("Failed to update the plot number"),
              )
            }
            className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm disabled:opacity-50"
          >
            {editPlot.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="rounded-full border px-4 py-2 font-semibold text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (confirming === "undo") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          Undo this allocation? Plot {request.plotNumber} goes back to Available and this request returns to Pending.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={revert.isPending}
            onClick={() => revert.mutate(request.id)}
            className="rounded-full bg-red-600 px-4 py-2 font-semibold text-white text-sm disabled:opacity-50"
          >
            {revert.isPending ? "Undoing…" : "Yes, undo"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="rounded-full border px-4 py-2 font-semibold text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  if (confirming === "delete") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          Delete this allocation request entirely?{" "}
          {request.plotNumber ? `Plot ${request.plotNumber} goes back to Available. ` : ""}This cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate(request.id)}
            className="rounded-full bg-red-600 px-4 py-2 font-semibold text-white text-sm disabled:opacity-50"
          >
            {remove.isPending ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="rounded-full border px-4 py-2 font-semibold text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          setNewPlotNumber(request.plotNumber ?? "");
          setEditError(null);
          setConfirming("edit");
        }}
        className="rounded-full border px-4 py-2 font-semibold text-sm"
      >
        Edit plot
      </button>
      <button
        type="button"
        onClick={() => setConfirming("undo")}
        className="rounded-full border px-4 py-2 font-semibold text-sm"
      >
        Undo → Pending
      </button>
      <button
        type="button"
        onClick={() => setConfirming("delete")}
        className="rounded-full border border-red-300 px-4 py-2 font-semibold text-red-600 text-sm dark:text-red-400"
      >
        Delete
      </button>
    </div>
  );
}
