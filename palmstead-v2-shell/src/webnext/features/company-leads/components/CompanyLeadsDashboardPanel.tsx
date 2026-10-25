"use client";

import { useQuery } from "@tanstack/react-query";
import { getDataSource } from "../../../data/source";
import { useSessionStore } from "../../../auth/useSessionStore";
import { EngagementDashboardPanel } from "../../../shared/ui/EngagementDashboardPanel";
import { useCompanyLeads } from "../hooks/useCompanyLeads";
import { useCompanyWideActivity } from "../hooks/useCallLog";

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.2 -- thin
// Company-Leads-scoped wrapper around the shared EngagementDashboardPanel
// (sits above the existing pipeline-value KPI strip rather than replacing
// it -- that strip stays for parity with Master Pipeline's own screen).
export function CompanyLeadsDashboardPanel() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: companyLeads, isLoading: leadsLoading } = useCompanyLeads();
  const { data: activity, isLoading: activityLoading } = useCompanyWideActivity();
  const siteVisitsQuery = useQuery({ queryKey: ["companyLeadsSiteVisits"], queryFn: () => getDataSource(demoMode).siteVisits.listAll() });
  const paymentsQuery = useQuery({ queryKey: ["companyLeadsPayments"], queryFn: () => getDataSource(demoMode).payments.listAll() });

  return (
    <EngagementDashboardPanel
      leads={companyLeads ?? []}
      activity={activity ?? []}
      visits={siteVisitsQuery.data ?? []}
      payments={paymentsQuery.data ?? []}
      isLoading={leadsLoading || activityLoading || siteVisitsQuery.isLoading || paymentsQuery.isLoading}
    />
  );
}
