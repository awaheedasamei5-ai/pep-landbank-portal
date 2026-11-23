"use client";

import { AlertTriangle, CircleCheck, Gauge, Wallet } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    { icon: Wallet, label: isManager ? "Outstanding" : "My leads outstanding", value: data ? ghs(data.outstanding) : null, metric: "outstanding" },
    { icon: CircleCheck, label: isManager ? "Fully paid" : "My fully paid clients", value: data ? String(data.fullyPaidCount) : null, metric: "fully-paid" },
    { icon: AlertTriangle, label: isManager ? "Open complaints" : "My open complaints", value: data ? String(data.openComplaints) : null, metric: "complaints" },
  ];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <Link key={c.label} href={`/dashboard/default/insights?metric=${c.metric}`} aria-label={`View ${c.label.toLowerCase()} details`} className="min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <Card className="h-full min-w-0 bg-linear-to-t from-primary/5 to-card shadow-xs transition-colors hover:border-primary/50 dark:bg-card">
          <CardHeader>
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <c.icon className="size-4" />
              </div>
            </CardTitle>
            <CardDescription>{c.label}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="break-words font-medium text-2xl tabular-nums leading-tight tracking-tight sm:text-3xl">
              {isLoading ? <span className="text-lg text-muted-foreground">Loading…</span> : c.value}
            </div>
            <span className="text-xs text-muted-foreground">View details →</span>
          </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

