"use client";

import { AlertTriangle, CircleCheck, Gauge, Wallet } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ghs } from "@/lib/palmstead/format";
import { useManagerOverview } from "@/lib/palmstead/use-manager-overview";
import { useAuthStore } from "@/stores/auth/auth-store";

// Real company-wide KPIs (leads/payments/complaints tables via RLS, see
// use-manager-overview.ts) -- replaces the template's 4 hardcoded fake
// metric cards (Total Revenue/New Customers/Active Accounts/Growth Rate).
export function MetricCards() {
  const { data, isLoading } = useManagerOverview();
  const isManager = useAuthStore((state) => state.profile?.role === "manager");

  const cards = [
    { icon: Gauge, label: isManager ? "Total leads" : "My leads", value: data ? String(data.totalLeads) : null, metric: "leads" },
    { icon: Wallet, label: isManager ? "Outstanding" : "My outstanding", value: data ? ghs(data.outstanding) : null, metric: "outstanding" },
    { icon: CircleCheck, label: isManager ? "Fully paid" : "My fully paid clients", value: data ? String(data.fullyPaidCount) : null, metric: "fully-paid" },
    { icon: AlertTriangle, label: isManager ? "Open complaints" : "My open complaints", value: data ? String(data.openComplaints) : null, metric: "complaints" },
  ];

  return (
    <Card className="grid min-w-0 grid-cols-1 gap-0 overflow-hidden py-0 min-[350px]:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Link key={c.label} href={`/dashboard/default/insights?metric=${c.metric}`} aria-label={`View ${c.label.toLowerCase()} details`} className="min-w-0 border-b p-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary min-[350px]:even:border-l lg:border-b-0 lg:p-5 lg:not-first:border-l">
          <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm"><c.icon className="size-4 shrink-0 text-primary" aria-hidden="true" /><span className="truncate">{c.label}</span></div>
          <div className="mt-2 break-words text-lg font-semibold tabular-nums leading-tight tracking-tight sm:text-2xl">{isLoading ? <span className="text-sm text-muted-foreground">Loading…</span> : c.value}</div>
          <span className="mt-2 block text-xs text-primary">View details →</span>
        </Link>
      ))}
    </Card>
  );
}


