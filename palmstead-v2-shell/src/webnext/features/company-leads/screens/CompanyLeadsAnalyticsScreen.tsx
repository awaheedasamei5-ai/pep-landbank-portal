"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { getDataSource } from "../../../data/source";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useCompanyLeads } from "../hooks/useCompanyLeads";
import { useCompanyWideActivity } from "../hooks/useCallLog";
import { EngagementAnalyticsTabs } from "../../../shared/ui/EngagementAnalyticsTabs";

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.3 -- thin
// Company-Leads-scoped wrapper around the shared EngagementAnalyticsTabs.
export function CompanyLeadsAnalyticsScreen() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: companyLeads, isLoading: leadsLoading } = useCompanyLeads();
  const { data: activity, isLoading: activityLoading } = useCompanyWideActivity();
  const siteVisitsQuery = useQuery({ queryKey: ["companyLeadsSiteVisits"], queryFn: () => getDataSource(demoMode).siteVisits.listAll() });
  const paymentsQuery = useQuery({ queryKey: ["companyLeadsPayments"], queryFn: () => getDataSource(demoMode).payments.listAll() });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/company-leads">
          <ArrowLeft />
          Company Leads
        </Link>
      </Button>

      <div className="mb-4">
        <PageHeader title="Company Leads Analytics" description="Day, month and year comparisons -- calls, active days, site visits and cash, scoped to Company Leads clients only." />
      </div>

      <EngagementAnalyticsTabs
        leads={companyLeads ?? []}
        activity={activity ?? []}
        visits={siteVisitsQuery.data ?? []}
        payments={paymentsQuery.data ?? []}
        isLoading={leadsLoading || activityLoading || siteVisitsQuery.isLoading || paymentsQuery.isLoading}
      />
    </div>
  );
}
