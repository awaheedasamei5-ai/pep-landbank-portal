"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useAuthStore } from "@/stores/auth/auth-store";
import { CommissionPanel } from "../../finance/_components/commission-panel";

// docs/plans/22-commission-plan.md -- dedicated one-click entry point for
// v1's real myCommission route (index.html:8404), reusing the already-built
// Accounting CommissionPanel verbatim (it already renders the real
// agent-scoped view -- month cursor, personal/pool breakdown, the real
// "raise a concern" dispute flow -- for any non-manager profile). No new
// business logic here, deliberately: that logic already exists and already
// works, duplicating it would be the dishonest shortcut, not the careful one.
export function CommissionScreen() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";

  if (isManager) {
    return (
      <div>
        <PageHeader title="Commission" description="Your personal commission, month by month." />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Landmark className="size-8 text-muted-foreground" />
            <p className="font-medium">See the full Accounting workspace instead</p>
            <p className="max-w-sm text-sm text-muted-foreground">This page is the staff-facing shortcut to your own commission. As Management, the company-wide pool breakdown and PDF report live in Accounting.</p>
            <Link href="/dashboard/finance?tab=commission" className="mt-2 text-sm font-medium text-primary hover:underline">
              Go to Accounting — Commission
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Commission" description="Your personal commission, month by month." />
      <CommissionPanel />
    </div>
  );
}
