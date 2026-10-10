"use client";

import { Clock, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ghs } from "@/lib/palmstead/format";
import { useAuthStore } from "@/stores/auth/auth-store";

import { useFinanceOverview } from "./use-finance-overview";

// Real Overview (Part B.2). Same visual language as dashboard/default's
// own MetricCards, same real source columns (leads.grand_total/amt_paid)
// for collected/outstanding so the two screens never silently disagree.
export function OverviewPanel() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";
  const { data, isLoading } = useFinanceOverview(isManager, profile?.key);

  const pendingCount = (data?.pendingPaymentsCount ?? 0) + (data?.pendingExpensesCount ?? 0);

  const cards = [
    { icon: TrendingUp, label: "Collected this month", value: data ? ghs(data.collectedThisMonth) : null },
    { icon: Wallet, label: isManager ? "Outstanding (company-wide)" : "Outstanding (your leads)", value: data ? ghs(data.outstanding) : null },
    { icon: TrendingDown, label: "Expense burn this month", value: data ? ghs(data.expenseBurnThisMonth) : null },
    { icon: Clock, label: "Pending approvals", value: data ? String(pendingCount) : null },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Overview</h2>
        <p className="text-sm text-muted-foreground">{isManager ? "Real company-wide financial snapshot." : "Your own collected and outstanding this month."}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
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
    </div>
  );
}
