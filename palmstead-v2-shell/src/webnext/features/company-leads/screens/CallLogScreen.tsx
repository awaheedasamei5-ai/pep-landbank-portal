"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useCompanyLeads } from "../hooks/useCompanyLeads";
import { useCompanyWideActivity } from "../hooks/useCallLog";
import { useQuery } from "@tanstack/react-query";
import { getDataSource } from "../../../data/source";
import { EngagementCallLogPanel } from "../../../shared/ui/EngagementCallLogPanel";

// docs/plans/28-company-leads-engagement-upgrade-plan.md Phase 1 -- the
// real company-wide Call Log, now a thin Company-Leads-scoped wrapper
// around the shared EngagementCallLogPanel. Every row is a real
// activity_log entry; "Log a call" writes a real one. Manager sees every
// company lead's calls, a staff member sees their own (real
// activity_log_sel RLS, unchanged).
export function CallLogScreen() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: companyLeads, isLoading: leadsLoading } = useCompanyLeads();
  const { data: activity, isLoading: activityLoading } = useCompanyWideActivity();
  const siteVisitsQuery = useQuery({ queryKey: ["companyLeadsSiteVisits"], queryFn: () => getDataSource(demoMode).siteVisits.listAll() });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/company-leads">
          <ArrowLeft />
          Company Leads
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Call Log" description="Every real call, message and contact attempt logged for Company Leads clients." />
      </div>

      <EngagementCallLogPanel
        leads={companyLeads ?? []}
        activity={activity ?? []}
        visits={siteVisitsQuery.data ?? []}
        isLoading={leadsLoading || activityLoading || siteVisitsQuery.isLoading}
        viewerKey={profile?.key}
        detailBasePath="/dashboard/company-leads"
        clientLabel="Company Leads clients"
      />
    </div>
  );
}
