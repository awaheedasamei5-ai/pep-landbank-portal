"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { getDataSource } from "../../../data/source";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useScopedActivity } from "../../../shared/hooks/useScopedActivity";
import { EngagementCallLogPanel } from "../../../shared/ui/EngagementCallLogPanel";
import { useLeads } from "../../pipeline/hooks/useLeads";
import { useAllLeads } from "../../payments/hooks/useLogPayment";

// docs/plans/29-company-leads-full-system-blueprint.md, generalized --
// the real Call Log Company Leads/Pipeline clients get, scoped to the
// same real lead pool Client Database itself groups from. "Open client"
// links to Master Pipeline's own detail route (/dashboard/pipeline/:id)
// since Client Database's own detail page is a different, multi-lead
// aggregate view this real activity_log row can't address directly.
export function ClientsCallLogScreen() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const isMgr = profile?.role === "manager";
  const own = useLeads();
  const all = useAllLeads();
  const { data: leads, isLoading: leadsLoading } = isMgr ? all : own;
  const activity = useScopedActivity(leads ?? []);
  const siteVisitsQuery = useQuery({ queryKey: ["clientsSiteVisits"], queryFn: () => getDataSource(demoMode).siteVisits.listAll() });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/clients">
          <ArrowLeft />
          Client Database
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Call Log" description={`Every real call, message and contact attempt logged${isMgr ? " company-wide" : " for your own clients"}.`} />
      </div>

      <EngagementCallLogPanel
        leads={leads ?? []}
        activity={activity.data}
        visits={siteVisitsQuery.data ?? []}
        isLoading={leadsLoading || activity.isLoading || siteVisitsQuery.isLoading}
        viewerKey={profile?.key}
        detailBasePath="/dashboard/pipeline"
        clientLabel={isMgr ? "clients company-wide" : "your clients"}
      />
    </div>
  );
}
