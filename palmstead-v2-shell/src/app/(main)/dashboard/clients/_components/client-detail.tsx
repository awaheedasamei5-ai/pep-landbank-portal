"use client";

import { useMemo } from "react";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { groupLeadsByClient } from "@/lib/palmstead/client-logic";
import { ghs } from "@/lib/palmstead/format";
import { qtyOfType } from "@/lib/palmstead/pipeline-pricing-logic";
import { useClientRelatedData } from "@/lib/palmstead/use-client-related-data";
import { usePipelineLeads } from "@/lib/palmstead/use-pipeline-leads";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const STAGE_TONE: Record<string, string> = {
  "1": "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  "2A": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "2B": "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "3": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "4": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Lost: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};
const PAYMENT_TONE: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  needs_correction: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  declined: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};
const ALLOCATION_TONE: Record<string, string> = {
  Allocated: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "Awaiting Authorization": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  Pending: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
};

function SectionCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">{count}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );
}

// Real port of web-next's ClientDetailScreen -- Master Rebuild Spec
// 17.2's Customer 360: "Open customer -> all related leads, payments,
// visits, allocations, contracts and complaints." Leads/Payments/
// Allocations are real; Site visits/Contracts/Complaints sections are
// honestly not ported -- those apps don't exist in this shell yet.
export function ClientDetail({ clientKey: key }: { clientKey: string }) {
  const router = useRouter();
  const { data: leads, isLoading } = usePipelineLeads();

  const client = useMemo(() => groupLeadsByClient(leads ?? []).find((c) => c.key === key), [leads, key]);
  const clientLeads = useMemo(() => (leads ?? []).filter((l) => client?.leadIds.includes(l.id)), [leads, client]);
  const { data: related } = useClientRelatedData(client?.leadIds ?? []);

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (!client) return <p className="text-muted-foreground text-sm">Client not found.</p>;

  const balance = Math.max(client.totalValue - client.totalPaid, 0);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => router.push("/dashboard/clients")}>
          ← Back
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
            {initials(client.name)}
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Customer 360</div>
            <h1 className="font-semibold text-2xl tracking-tight">{client.name}</h1>
            <p className="text-muted-foreground text-sm">{client.contact}</p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() =>
            router.push(
              `/dashboard/pipeline/new?name=${encodeURIComponent(client.name)}&contact=${encodeURIComponent(client.contact)}`,
            )
          }
        >
          + New deal for this client
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-muted-foreground text-xs">Total value</div>
            <div className="font-semibold text-2xl tabular-nums">{ghs(client.totalValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-muted-foreground text-xs">Paid</div>
            <div className="font-semibold text-2xl tabular-nums">{ghs(client.totalPaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-muted-foreground text-xs">Balance</div>
            <div className="font-semibold text-2xl tabular-nums">{ghs(balance)}</div>
          </CardContent>
        </Card>
      </div>

      <SectionCard title="Leads" count={clientLeads.length}>
        {clientLeads.length === 0 && <p className="text-muted-foreground text-sm">No leads on file.</p>}
        {clientLeads.map((l) => (
          <button
            type="button"
            key={l.id}
            className="flex items-center justify-between rounded-md border p-3 text-left text-sm hover:bg-muted"
            onClick={() => router.push(`/dashboard/pipeline/${l.id}`)}
          >
            <div>
              <div className="font-medium">
                {l.plotType}
                {qtyOfType(l.plotType as "Full Plot" | "Half Plot", l.noPlots) > 1
                  ? ` ×${qtyOfType(l.plotType as "Full Plot" | "Half Plot", l.noPlots)}`
                  : ""}
              </div>
              <div className="text-muted-foreground text-xs">{l.dateAdded}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">{ghs(l.grandTotal)}</span>
              <Badge variant="outline" className={STAGE_TONE[l.stage]}>
                {l.stage}
              </Badge>
            </div>
          </button>
        ))}
      </SectionCard>

      <SectionCard title="Payments" count={related?.payments.length ?? 0}>
        {(related?.payments.length ?? 0) === 0 && (
          <p className="text-muted-foreground text-sm">No payments logged yet.</p>
        )}
        {related?.payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div>
              <div className="font-medium tabular-nums">{ghs(p.amount)}</div>
              <div className="text-muted-foreground text-xs">
                {p.date}
                {p.paymentMethod ? ` · ${p.paymentMethod}` : ""}
              </div>
            </div>
            <Badge variant="outline" className={PAYMENT_TONE[p.status] ?? PAYMENT_TONE.pending}>
              {p.status}
            </Badge>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Allocations" count={related?.allocations.length ?? 0}>
        {(related?.allocations.length ?? 0) === 0 && (
          <p className="text-muted-foreground text-sm">No allocation requests.</p>
        )}
        {related?.allocations.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div>
              <div className="font-medium">{a.plotNumber || "Plot not yet picked"}</div>
              <div className="text-muted-foreground text-xs">{a.createdAt.slice(0, 10)}</div>
            </div>
            <Badge variant="outline" className={ALLOCATION_TONE[a.status] ?? ALLOCATION_TONE.Pending}>
              {a.status}
            </Badge>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}
