"use client";

import { AlertTriangle, CircleCheck, Gauge, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ghs } from "@/lib/palmstead/format";
import { useManagerOverview } from "@/lib/palmstead/use-manager-overview";

// Real company-wide KPIs (leads/payments/complaints tables via RLS, see
// use-manager-overview.ts) -- replaces the template's 4 hardcoded fake
// metric cards (Total Revenue/New Customers/Active Accounts/Growth Rate).
export function MetricCards() {
  const { data, isLoading } = useManagerOverview();

  const cards = [
    { icon: Gauge, label: "Total leads", value: data ? String(data.totalLeads) : null },
    { icon: Wallet, label: "Outstanding", value: data ? ghs(data.outstanding) : null },
    { icon: CircleCheck, label: "Fully paid", value: data ? String(data.fullyPaidCount) : null },
    { icon: AlertTriangle, label: "Open complaints", value: data ? String(data.openComplaints) : null },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader>
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <c.icon className="size-4" />
              </div>
            </CardTitle>
            <CardDescription>{c.label}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              {isLoading ? <span className="text-lg text-muted-foreground">Loading…</span> : c.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
