"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { getDataSource } from "../../../data/source";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useScopedActivity } from "../../../shared/hooks/useScopedActivity";
import { EngagementAnalyticsTabs } from "../../../shared/ui/EngagementAnalyticsTabs";
import { useLeads } from "../../pipeline/hooks/useLeads";
import { useAllLeads } from "../../payments/hooks/useLogPayment";

// docs/plans/29-company-leads-full-system-blueprint.md, generalized --
// same real Day/Month/Year Analytics every Company Leads/Pipeline client
// gets, scoped to the same real lead pool Client Database itself groups
// from (own leads for a staff member, company-wide for a manager).
export function ClientsAnalyticsScreen() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const isMgr = profile?.role === "manager";
  const own = useLeads();
  const all = useAllLeads();
  const { data: leads, isLoading: leadsLoading } = isMgr ? all : own;
  const activity = useScopedActivity(leads ?? []);
  const siteVisitsQuery = useQuery({ queryKey: ["clientsSiteVisits"], queryFn: () => getDataSource(demoMode).siteVisits.listAll() });
  const paymentsQuery = useQuery({ queryKey: ["clientsPayments"], queryFn: () => getDataSource(demoMode).payments.listAll() });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/clients">
          <ArrowLeft />
          Client Database
        </Link>
      </Button>

      <div className="mb-4">
        <PageHeader
          title="Client Database Analytics"
          description={`Day, month and year comparisons -- calls, active days, site visits and cash${isMgr ? ", company-wide" : ", scoped to your own clients"}.`}
        />
      </div>

      <EngagementAnalyticsTabs
        leads={leads ?? []}
        activity={activity.data}
        visits={siteVisitsQuery.data ?? []}
        payments={paymentsQuery.data ?? []}
        isLoading={leadsLoading || activity.isLoading || siteVisitsQuery.isLoading || paymentsQuery.isLoading}
      />
    </div>
  );
}
