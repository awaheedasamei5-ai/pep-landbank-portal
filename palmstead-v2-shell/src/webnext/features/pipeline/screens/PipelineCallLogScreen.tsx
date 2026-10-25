"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useScopedActivity } from "../../../shared/hooks/useScopedActivity";
import { EngagementCallLogPanel } from "../../../shared/ui/EngagementCallLogPanel";
import { useLeads } from "../hooks/useLeads";
import { useAllLeads } from "../../payments/hooks/useLogPayment";
import { useSiteVisits } from "../../site-visits/hooks/useSiteVisits";

// docs/plans/29-company-leads-full-system-blueprint.md, generalized --
// the real Call Log (every real call, outcome, follow-up, period trends,
// visited/bought cohort) Company Leads got, scoped to My Pipeline (own
// leads) or Master Pipeline (company-wide), same role-derived branch
// PipelineListScreen itself already uses.
export function PipelineCallLogScreen() {
  const profile = useSessionStore((s) => s.profile);
  const isMaster = profile?.role === "manager";
  const mine = useLeads();
  const master = useAllLeads();
  const { data: leads, isLoading: leadsLoading } = isMaster ? master : mine;
  const activity = useScopedActivity(leads ?? []);
  const { data: siteVisits, isLoading: visitsLoading } = useSiteVisits();

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/pipeline">
          <ArrowLeft />
          {isMaster ? "Master Pipeline" : "My Pipeline"}
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="Call Log"
          description={`Every real call, message and contact attempt logged${isMaster ? " company-wide" : " for your own pipeline"}.`}
        />
      </div>

      <EngagementCallLogPanel
        leads={leads ?? []}
        activity={activity.data}
        visits={siteVisits ?? []}
        isLoading={leadsLoading || activity.isLoading || visitsLoading}
        viewerKey={profile?.key}
        detailBasePath="/dashboard/pipeline"
        clientLabel={isMaster ? "clients company-wide" : "your clients"}
      />
    </div>
  );
}
