"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDataSource } from "../../../data/source";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useCompanyLeads } from "./useCompanyLeads";
import { useCompanyWideActivity } from "./useCallLog";
import { computeVisitCohort } from "../lib/callLogLogic";
import { bucketByGranularity, defaultPeriodFilter, inRange, periodToRange, type PeriodFilter } from "../lib/periodFilter";

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.4 -- the
// real Call Log "Trends" strip: a period-aware calls-by-granularity chart
// plus the real visited/bought/not-bought cohort (computeVisitCohort),
// answering the user's own question directly: "how many of the people
// have gone to site out of the company leads, how many have bought the
// land, how many didn't buy."
export function useCallLogTrends() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const [filter, setFilter] = useState<PeriodFilter>(defaultPeriodFilter());

  const { data: companyLeads, isLoading: leadsLoading } = useCompanyLeads();
  const { data: activity, isLoading: activityLoading } = useCompanyWideActivity();
  const siteVisitsQuery = useQuery({ queryKey: ["companyLeadsSiteVisits"], queryFn: () => getDataSource(demoMode).siteVisits.listAll() });

  const isLoading = leadsLoading || activityLoading || siteVisitsQuery.isLoading;

  const leads = companyLeads ?? [];
  const allActivity = activity ?? [];
  const leadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads]);
  const allVisits = useMemo(() => (siteVisitsQuery.data ?? []).filter((v) => v.leadId && leadIds.has(v.leadId)), [siteVisitsQuery.data, leadIds]);

  const cohort = useMemo(() => computeVisitCohort(leads, allVisits), [leads, allVisits]);

  const chartData = useMemo(() => {
    const points = bucketByGranularity(
      allActivity.map((e) => e.createdAt),
      filter,
    );
    return points.map((p) => ({ label: p.label, calls: p.count }));
  }, [allActivity, filter]);

  const siteVisitsInPeriod = useMemo(() => {
    const range = periodToRange(filter);
    return allVisits.filter((v) => inRange(v.visitDate, range)).length;
  }, [allVisits, filter]);

  return { isLoading, filter, setFilter, chartData, cohort, siteVisitsInPeriod, activityDates: allActivity.map((e) => e.createdAt) };
}
