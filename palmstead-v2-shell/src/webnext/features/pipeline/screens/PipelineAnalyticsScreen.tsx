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
import { useLeads } from "../hooks/useLeads";
import { useAllLeads } from "../../payments/hooks/useLogPayment";
import { useSiteVisits } from "../../site-visits/hooks/useSiteVisits";

// docs/plans/29-company-leads-full-system-blueprint.md, generalized --
// same real Day/Month/Year Analytics every Company Leads client gets,
// scoped to My Pipeline (own leads) or Master Pipeline (company-wide),
// same role-derived branch PipelineListScreen itself already uses.
export function PipelineAnalyticsScreen() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const isMaster = profile?.role === "manager";
  const mine = useLeads();
  const master = useAllLeads();
  const { data: leads, isLoading: leadsLoading } = isMaster ? master : mine;
  const activity = useScopedActivity(leads ?? []);
  const { data: siteVisits, isLoading: visitsLoading } = useSiteVisits();
  const paymentsQuery = useQuery({ queryKey: ["pipelinePayments"], queryFn: () => getDataSource(demoMode).payments.listAll() });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/pipeline">
          <ArrowLeft />
          {isMaster ? "Master Pipeline" : "My Pipeline"}
        </Link>
      </Button>

      <div className="mb-4">
        <PageHeader
          title={isMaster ? "Master Pipeline Analytics" : "My Pipeline Analytics"}
          description={`Day, month and year comparisons -- calls, active days, site visits and cash${isMaster ? ", company-wide" : ", scoped to your own pipeline"}.`}
        />
      </div>

      <EngagementAnalyticsTabs
        leads={leads ?? []}
        activity={activity.data}
        visits={siteVisits ?? []}
        payments={paymentsQuery.data ?? []}
        isLoading={leadsLoading || activity.isLoading || visitsLoading || paymentsQuery.isLoading}
      />
    </div>
  );
}
