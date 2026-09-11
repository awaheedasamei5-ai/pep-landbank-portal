"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ghs, today } from "@/lib/palmstead/format";
import { STAGE_LABELS } from "@/lib/palmstead/pipeline-logic";
import {
  computeDepositStatus,
  computeMonthlySchedule,
  type PaymentPlan,
  type PlotType,
  previewGrandTotal,
  qtyOfType,
} from "@/lib/palmstead/pipeline-pricing-logic";
import { useAllocationRequests, useCreateAllocationRequest } from "@/lib/palmstead/use-allocation-requests";
import { useAppConfig } from "@/lib/palmstead/use-app-config";
import {
  DOC_STAGES,
  type LeadDetail as LeadDetailRow,
  useAssignLead,
  useCanLogPayments,
  useCanViewDocStage,
  useCreatePayment,
  useDeleteLead,
  useLead,
  usePaymentsForLead,
  useStaffDirectory,
  useUpdateLead,
  useUpdateLeadDocStage,
} from "@/lib/palmstead/use-lead";
import { useAuthStore } from "@/stores/auth/auth-store";

import { PartialPlotAdder } from "./partial-plot-adder";

const inputClass =
  "h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const labelClass = "text-xs font-medium text-muted-foreground";

const STAGE_TONE: Record<string, string> = {
  "1": "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  "2A": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "2B": "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "3": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "4": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Lost: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// Real port of web-next's PipelineDetailScreen -- same real sections
// (Client/Lead details/Plot & pricing/Deposit & schedule/Allocation
// eligibility/Follow-up/Log a payment/Payment history/Documentation/
// Danger zone), rendered as this shell's own Tailwind/shadcn cards
// instead of web-next's CSS-module drawer. Honestly not ported (flagged,
// not silently dropped): the AI follow-up draft, receipt download/share
// links, the Site visits section (that app doesn't exist in this shell
// yet), and the Activity/Audit-trail timelines -- all real, all
// separable, all deferred for a first pass.
export function LeadDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: lead, isLoading } = useLead(id);
  const { data: payments } = usePaymentsForLead(id);
  const { data: config } = useAppConfig();

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!lead) return <p className="text-muted-foreground text-sm">Lead not found.</p>;

  const balance = Math.max(lead.grandTotal - lead.amtPaid, 0);
  const pctCollected = lead.grandTotal > 0 ? Math.min(100, Math.round((lead.amtPaid / lead.grandTotal) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => router.push("/dashboard/pipeline")}>
          ← Back
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
          {initials(lead.name)}
        </div>
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{lead.name}</h1>
          <p className="text-muted-foreground text-sm">
            {lead.contact} · {lead.plotType}
            {qtyOfType(lead.plotType, lead.noPlots) > 1 ? ` ×${qtyOfType(lead.plotType, lead.noPlots)}` : ""} ·{" "}
            <Badge variant="outline" className={STAGE_TONE[lead.stage]}>
              {STAGE_LABELS[lead.stage]}
            </Badge>
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-muted-foreground text-xs">Balance remaining</div>
              <div className="font-semibold text-2xl tabular-nums">{ghs(balance)}</div>
            </div>
            <div className="text-muted-foreground text-sm">{pctCollected}%</div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pctCollected}%` }} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium tabular-nums">{ghs(lead.grandTotal)}</div>
              <div className="text-muted-foreground text-xs">Pipeline value</div>
            </div>
            <div className="text-right">
              <div className="font-medium tabular-nums">{ghs(lead.amtPaid)}</div>
              <div className="text-muted-foreground text-xs">Collected</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ClientSection lead={lead} />
      <LeadDetailsSection lead={lead} />
      {config && <PlotPricingSection lead={lead} config={config} />}
      {config && lead.paymentPlan !== "Full Payment" && (
        <DepositScheduleSection lead={lead} config={config} payments={payments ?? []} />
      )}
      {config && <AllocationEligibilitySection lead={lead} config={config} />}
      <FollowUpSection lead={lead} />
      <PaymentSection lead={lead} payments={payments ?? []} />
      <DocumentationSection lead={lead} />
      <DangerZoneSection lead={lead} onDeleted={() => router.push("/dashboard/pipeline")} />
    </div>
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function ReadRow({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={danger ? "text-destructive" : undefined}>{value}</span>
    </div>
  );
}

function ClientSection({ lead }: { lead: LeadDetailRow }) {
  const update = useUpdateLead();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(lead.name);
  const [contact, setContact] = useState(lead.contact);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <SectionCard
        title="Client"
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      >
        <ReadRow label="Name" value={lead.name} />
        <ReadRow label="Contact" value={lead.contact || "—"} />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Client">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Full name</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Contact</span>
        <input className={inputClass} value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={update.isPending || !name.trim()}
          onClick={() =>
            update
              .mutateAsync({
                id: lead.id,
                patch: { name: name.trim(), contact: contact.trim(), expectedVersion: lead.version },
              })
              .then(
                () => setEditing(false),
                (e) => setError(e instanceof Error ? e.message : "Failed to save"),
              )
          }
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </SectionCard>
  );
}

const PRIORITIES = ["High", "Medium", "Low"] as const;

function LeadDetailsSection({ lead }: { lead: LeadDetailRow }) {
  const profile = useAuthStore((s) => s.profile);
  const update = useUpdateLead();
  const assignLead = useAssignLead();
  const { data: staff } = useStaffDirectory();
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState(lead.leadSource ?? "");
  const [priority, setPriority] = useState(lead.priority ?? "");
  const [address, setAddress] = useState(lead.address ?? "");
  const [reassigning, setReassigning] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const staffName =
    lead.agentKey === "company"
      ? "Company Leads (unassigned)"
      : (staff?.find((s) => s.key === lead.agentKey)?.name ?? lead.agentKey);
  const isManager = profile?.role === "manager";

  if (!editing) {
    return (
      <SectionCard
        title="Lead details"
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      >
        {/* biome-ignore-start lint/nursery/useNullishCoalescing: an empty-string value should also fall through to the placeholder, not just null/undefined. */}
        <ReadRow label="Source" value={lead.leadSource || "—"} />
        <ReadRow label="Priority" value={lead.priority || "—"} />
        <ReadRow label="Address" value={lead.address || "—"} />
        {/* biome-ignore-end lint/nursery/useNullishCoalescing: see above */}
        <ReadRow label="Assigned to" value={staffName} />
        {isManager && !reassigning && (
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setReassigning(true)}>
            Reassign
          </Button>
        )}
        {isManager && reassigning && (
          <div className="flex gap-2">
            <select className={inputClass} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Select staff…</option>
              {(staff ?? []).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={!assignTo || assignLead.isPending}
              onClick={() =>
                assignLead.mutateAsync({ id: lead.id, agentKey: assignTo }).then(() => setReassigning(false))
              }
            >
              {assignLead.isPending ? "Reassigning…" : "Confirm"}
            </Button>
          </div>
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Lead details">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Source</span>
        <input
          className={inputClass}
          placeholder="e.g. Referral, Walk-in, Facebook"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Priority</span>
        <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Not set</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Address</span>
        <input
          className={inputClass}
          placeholder="Client's physical address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={update.isPending}
          onClick={() =>
            update
              .mutateAsync({
                id: lead.id,
                patch: {
                  leadSource: source.trim() || undefined,
                  priority: priority || undefined,
                  address: address.trim() || undefined,
                  expectedVersion: lead.version,
                },
              })
              .then(
                () => setEditing(false),
                (e) => setError(e instanceof Error ? e.message : "Failed to save"),
              )
          }
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </SectionCard>
  );
}

function PlotPricingSection({
  lead,
  config,
}: {
  lead: LeadDetailRow;
  config: NonNullable<ReturnType<typeof useAppConfig>["data"]>;
}) {
  const update = useUpdateLead();
  const [editing, setEditing] = useState(false);
  const [plotType, setPlotType] = useState<PlotType>(lead.plotType);
  const [noPlots, setNoPlots] = useState(String(lead.noPlots));
  const [unitPrice, setUnitPrice] = useState(String(lead.unitPrice));
  const [discount, setDiscount] = useState(lead.discount != null ? String(lead.discount) : "");
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>(lead.paymentPlan);
  const [error, setError] = useState<string | null>(null);

  const preview = previewGrandTotal(
    config,
    plotType,
    Number(noPlots) || 1,
    Number(unitPrice) || 0,
    discount === "" ? null : Number(discount),
    paymentPlan,
  );

  if (!editing) {
    return (
      <SectionCard
        title="Plot & pricing"
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      >
        <ReadRow label="Plot type" value={`${lead.plotType} ×${qtyOfType(lead.plotType, lead.noPlots)}`} />
        <ReadRow label="Unit price" value={ghs(lead.unitPrice)} />
        <ReadRow label="Discount" value={ghs(lead.discount ?? 0)} />
        <ReadRow label="Payment plan" value={lead.paymentPlan} />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Plot & pricing">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Plot type</span>
          <select className={inputClass} value={plotType} onChange={(e) => setPlotType(e.target.value as PlotType)}>
            <option>Full Plot</option>
            <option>Half Plot</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>No. of plots</span>
          <input
            className={inputClass}
            type="number"
            step="0.5"
            min="0.5"
            value={noPlots}
            onChange={(e) => setNoPlots(e.target.value)}
          />
        </div>
      </div>
      <PartialPlotAdder
        config={config}
        plotType={plotType}
        onAdd={(eq) => setNoPlots(String(Math.round((Number(noPlots || 0) + eq) * 100) / 100))}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Unit price (GHS)</span>
          <input
            className={inputClass}
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Discount (GHS)</span>
          <input className={inputClass} type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Payment plan</span>
        <select
          className={inputClass}
          value={paymentPlan}
          onChange={(e) => setPaymentPlan(e.target.value as PaymentPlan)}
        >
          <option>Full Payment</option>
          <option>3 Months</option>
          <option>6 Months</option>
          <option>9 Months</option>
          <option>12 Months</option>
        </select>
      </div>
      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Net total</span>
          <span className="tabular-nums">{ghs(preview.net)}</span>
        </div>
        {preview.interest > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">+ Interest</span>
            <span className="tabular-nums">{ghs(preview.interest)}</span>
          </div>
        )}
        <div className="flex justify-between font-medium">
          <span>Grand total</span>
          <span className="tabular-nums">{ghs(preview.grand)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">New balance</span>
          <span className="tabular-nums">{ghs(Math.max(preview.grand - lead.amtPaid, 0))}</span>
        </div>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={update.isPending}
          onClick={() =>
            update
              .mutateAsync({
                id: lead.id,
                patch: {
                  plotType,
                  noPlots: Number(noPlots) || 1,
                  unitPrice: Number(unitPrice) || 0,
                  discount: discount === "" ? undefined : Number(discount),
                  paymentPlan,
                  netTotal: preview.net,
                  grandTotal: preview.grand,
                  expectedVersion: lead.version,
                },
              })
              .then(
                () => setEditing(false),
                (e) => setError(e instanceof Error ? e.message : "Failed to save"),
              )
          }
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </SectionCard>
  );
}

function DepositScheduleSection({
  lead,
  config,
  payments,
}: {
  lead: LeadDetailRow;
  config: NonNullable<ReturnType<typeof useAppConfig>["data"]>;
  payments: { amount: number; date: string }[];
}) {
  const dep = computeDepositStatus(config, lead, payments);
  const sched = computeMonthlySchedule(config, { ...lead, paymentPlan: lead.paymentPlan }, payments);

  if (!dep.complete) {
    return (
      <SectionCard title="Deposit & schedule">
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Deposit paid</span>
            <span className="tabular-nums">
              {ghs(dep.paid)} of {ghs(dep.target)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining</span>
            <span className="tabular-nums">{ghs(dep.remaining)}</span>
          </div>
        </div>
      </SectionCard>
    );
  }

  if (!sched) {
    return (
      <SectionCard title="Deposit & schedule">
        <p className="text-muted-foreground text-sm">Deposit cleared — installment schedule not yet available.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Deposit & schedule">
      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">This month&apos;s installment</span>
          <span className="tabular-nums">{ghs(sched.expectedThisMonth)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Month</span>
          <span>
            {sched.monthsElapsed} of {sched.planMonths}
          </span>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        {ghs(sched.monthlyInstallment)}/mo · due {sched.nextDueDate}
        {sched.arrears > 0 && (
          <span className="text-destructive"> · {ghs(sched.arrears)} overdue from earlier months</span>
        )}
      </p>
    </SectionCard>
  );
}

function AllocationEligibilitySection({
  lead,
  config,
}: {
  lead: LeadDetailRow;
  config: NonNullable<ReturnType<typeof useAppConfig>["data"]>;
}) {
  const router = useRouter();
  const { data: requests } = useAllocationRequests();
  const create = useCreateAllocationRequest();
  const [error, setError] = useState<string | null>(null);

  const dep = computeDepositStatus(config, lead, []);
  const existing = (requests ?? []).find((r) => r.leadId === lead.id);

  if (existing) {
    let statusText = "Allocation request submitted — awaiting suggestion.";
    if (existing.status === "Allocated") statusText = `Plot ${existing.plotNumber} allocated.`;
    else if (existing.status === "Awaiting Authorization")
      statusText = "Allocation request awaiting Management sign-off.";
    return (
      <SectionCard title="Allocation">
        <p className="text-muted-foreground text-sm">
          {statusText}{" "}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => router.push("/dashboard/allocations")}
          >
            View in Allocations →
          </Button>
        </p>
      </SectionCard>
    );
  }

  if (!dep.complete) {
    return (
      <SectionCard title="Allocation">
        <Button
          type="button"
          disabled
          title={`Needs ${config.allocationThresholdPct}% paid before allocation can be requested`}
        >
          Request Allocation
        </Button>
        <p className="text-muted-foreground text-sm">
          {ghs(dep.paid)} of {ghs(dep.target)} ({config.allocationThresholdPct}% target) paid — {ghs(dep.remaining)}{" "}
          more needed before this client is eligible for allocation.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Allocation">
      <p className="text-muted-foreground text-sm">
        {config.allocationThresholdPct}% deposit threshold met ({ghs(dep.paid)} of {ghs(dep.target)}) — eligible to
        request allocation.
      </p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button
        type="button"
        disabled={create.isPending}
        onClick={() =>
          create.mutateAsync(lead.id).then(
            () => router.push("/dashboard/allocations"),
            (e) => setError(e instanceof Error ? e.message : "Failed to request allocation"),
          )
        }
      >
        {create.isPending ? "Requesting…" : "Request Allocation"}
      </Button>
    </SectionCard>
  );
}

function FollowUpSection({ lead }: { lead: LeadDetailRow }) {
  const update = useUpdateLead();
  const [editing, setEditing] = useState(false);
  const [markLost, setMarkLost] = useState(lead.stage === "Lost");
  const [nextAction, setNextAction] = useState(lead.nextAction ?? "");
  const [nextActionDate, setNextActionDate] = useState(lead.nextActionDate ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [tags, setTags] = useState(lead.tags ?? "");
  const [siteVisit, setSiteVisit] = useState(lead.siteVisit === "Yes");
  const [error, setError] = useState<string | null>(null);

  const isOverdue =
    !!lead.nextActionDate && lead.nextActionDate < today() && lead.stage !== "4" && lead.stage !== "Lost";

  if (!editing) {
    return (
      <SectionCard
        title="Follow-up"
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      >
        {/* biome-ignore-start lint/nursery/useNullishCoalescing: an empty-string value should also fall through to the placeholder, not just null/undefined. */}
        <ReadRow label="Next step" value={lead.nextAction || "—"} />
        <ReadRow
          label="Due"
          value={`${lead.nextActionDate || "—"}${isOverdue ? " · Overdue" : ""}`}
          danger={isOverdue}
        />
        <ReadRow label="Tags" value={lead.tags || "—"} />
        {/* biome-ignore-end lint/nursery/useNullishCoalescing: see above */}
        <ReadRow label="Site visit" value={lead.siteVisit === "Yes" ? "Visited" : "Not yet"} />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Follow-up">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={markLost} onChange={(e) => setMarkLost(e.target.checked)} /> Mark this lead as
        Lost
      </label>
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Next step agreed</span>
        <input className={inputClass} value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Due date (optional)</span>
        <input
          className={inputClass}
          type="date"
          value={nextActionDate}
          onChange={(e) => setNextActionDate(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Notes</span>
        <textarea className={`${inputClass} h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Tags</span>
        <input
          className={inputClass}
          placeholder="e.g. VIP, Referral, Diaspora"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={siteVisit} onChange={(e) => setSiteVisit(e.target.checked)} /> Client has
        visited the site
      </label>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={update.isPending}
          onClick={() =>
            update
              .mutateAsync({
                id: lead.id,
                patch: {
                  stage: markLost ? "Lost" : lead.stage,
                  nextAction: nextAction.trim(),
                  nextActionDate: nextActionDate || null,
                  notes: notes.trim(),
                  tags: tags.trim(),
                  siteVisit: siteVisit ? "Yes" : (lead.siteVisit ?? undefined),
                  expectedVersion: lead.version,
                },
              })
              .then(
                () => setEditing(false),
                (e) => setError(e instanceof Error ? e.message : "Failed to save"),
              )
          }
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </SectionCard>
  );
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  approved: "Successful",
  pending: "Awaiting approval",
  declined: "Declined",
  needs_correction: "Declined",
};

function PaymentSection({
  lead,
  payments,
}: {
  lead: LeadDetailRow;
  payments: { id: string; amount: number; date: string; status: string }[];
}) {
  const profile = useAuthStore((s) => s.profile);
  const canLog = useCanLogPayments();
  const createPayment = useCreatePayment();
  const [amount, setAmount] = useState("");

  const balance = Math.max(lead.grandTotal - lead.amtPaid, 0);
  const quickAmounts = [
    { label: "25%", value: Math.round(balance * 0.25) },
    { label: "50%", value: Math.round(balance * 0.5) },
    { label: "Full balance", value: balance },
  ].filter((q) => q.value > 0);

  return (
    <>
      {canLog && (
        <SectionCard title="Log a payment">
          {quickAmounts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                  onClick={() => setAmount(String(q.value))}
                >
                  {q.label} <span className="text-muted-foreground">{ghs(q.value)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Amount (GHS)</span>
            <input
              className={inputClass}
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button
            type="button"
            disabled={createPayment.isPending || !amount}
            onClick={() =>
              createPayment
                .mutateAsync({ leadId: lead.id, leadName: lead.name, agentKey: lead.agentKey, amount: Number(amount) })
                .then(() => setAmount(""))
            }
          >
            {createPayment.isPending ? "Saving…" : "Save payment"}
          </Button>
          {profile?.role !== "manager" && (
            <p className="text-muted-foreground text-xs">
              This will be sent to Management for approval before it reflects on the balance.
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard title="Payment history">
        {payments.length === 0 && (
          <p className="text-muted-foreground text-sm">No individual payments logged yet — only a starting total.</p>
        )}
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span>{p.date}</span>
              <Badge
                variant="outline"
                className={
                  p.status === "approved"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                }
              >
                {PAYMENT_STATUS_LABEL[p.status] ?? "Declined"}
              </Badge>
            </div>
            <span className={p.status !== "approved" ? "text-muted-foreground" : "font-medium"}>+{ghs(p.amount)}</span>
          </div>
        ))}
      </SectionCard>
    </>
  );
}

function updateStageButtonLabel(isPending: boolean, done: boolean): string {
  if (isPending) return "Updating…";
  if (done) return "Updated ✓";
  return "Update stage";
}

function DocumentationSection({ lead }: { lead: LeadDetailRow }) {
  const canView = useCanViewDocStage();
  const updateStage = useUpdateLeadDocStage();
  const [stage, setStage] = useState(lead.docStage ?? "");
  const [done, setDone] = useState(false);

  if (!canView) return null;
  const currentLabel = DOC_STAGES.find((d) => d.key === lead.docStage)?.label;

  return (
    <SectionCard title="Documentation & allocation">
      <p className="text-muted-foreground text-sm">
        {currentLabel ? `Currently: ${currentLabel}` : "Not started yet."}
      </p>
      <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value)}>
        <option value="">— Not started —</option>
        {DOC_STAGES.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        disabled={!stage || updateStage.isPending}
        onClick={() =>
          updateStage.mutateAsync({ id: lead.id, stage }).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          })
        }
      >
        {updateStageButtonLabel(updateStage.isPending, done)}
      </Button>
    </SectionCard>
  );
}

const DELETE_REASONS = [
  { key: "wrong", label: "Wrong data", detail: "I'll re-create this lead correctly." },
  { key: "duplicate", label: "Duplicate lead", detail: "This client already has another lead record." },
  { key: "refund", label: "Client cancelled / refund", detail: "Any plot allocated to them becomes Available again." },
  { key: "removal", label: "Client requested removal", detail: "The client asked to be taken out of the system." },
  { key: "other", label: "Other reason", detail: "Describe why below." },
] as const;

function DangerZoneSection({ lead, onDeleted }: { lead: LeadDetailRow; onDeleted: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const del = useDeleteLead();
  const [reasonKey, setReasonKey] = useState<(typeof DELETE_REASONS)[number]["key"] | null>(null);
  const [otherText, setOtherText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = DELETE_REASONS.find((r) => r.key === reasonKey);
  const finalReason = reasonKey === "other" ? otherText.trim() : (selected?.label ?? "");

  async function confirmDelete() {
    if (!finalReason) return;
    setError(null);
    try {
      await del.mutateAsync({
        id: lead.id,
        reason: finalReason,
        deletedBy: profile?.key ?? "",
        deletedByName: profile?.name ?? "",
      });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive this lead");
    }
  }

  if (selected) {
    return (
      <SectionCard title={`Archive ${lead.name}?`}>
        <p className="text-muted-foreground text-sm">
          Management can restore this later, but it leaves the active pipeline immediately.
        </p>
        {reasonKey === "other" && (
          <textarea
            className={`${inputClass} h-20 py-2`}
            placeholder="Reason (required)"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
          />
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setReasonKey(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1"
            disabled={del.isPending || !finalReason}
            onClick={confirmDelete}
          >
            {del.isPending ? "Archiving…" : "Yes, archive"}
          </Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Danger zone">
      <p className="text-muted-foreground text-sm">
        Archives {lead.name} out of the active pipeline. Management can see why and restore it.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {DELETE_REASONS.map((r) => (
          <button
            key={r.key}
            type="button"
            className="rounded-md border p-3 text-left text-sm hover:bg-muted"
            onClick={() => setReasonKey(r.key)}
          >
            <div className="font-medium">{r.label}</div>
            <div className="text-muted-foreground text-xs">{r.detail}</div>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}
