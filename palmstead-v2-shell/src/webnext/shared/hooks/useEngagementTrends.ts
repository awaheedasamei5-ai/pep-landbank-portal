"use client";

import { useMemo, useState } from "react";
import type { ActivityLogEntry, Lead, SiteVisit } from "../../types/domain";
import { computeVisitCohort } from "../lib/callActivityLogic";
import { bucketByGranularity, defaultPeriodFilter, inRange, periodToRange, type PeriodFilter } from "../lib/engagementPeriod";

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.4,
// generalized for Pipeline and Client Database -- the real Call Log
// "Trends" strip: a period-aware calls-by-granularity chart plus the
// real visited/bought/not-bought cohort. Takes already-scoped data, same
// pattern as useEngagementDashboard/useEngagementAnalytics.
export function useEngagementTrends(leads: Lead[], activity: ActivityLogEntry[], visits: SiteVisit[]) {
  const [filter, setFilter] = useState<PeriodFilter>(defaultPeriodFilter());

  const leadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads]);
  const allVisits = useMemo(() => visits.filter((v) => v.leadId && leadIds.has(v.leadId)), [visits, leadIds]);

  const cohort = useMemo(() => computeVisitCohort(leads, allVisits), [leads, allVisits]);

  const chartData = useMemo(() => {
    const points = bucketByGranularity(
      activity.map((e) => e.createdAt),
      filter,
    );
    return points.map((p) => ({ label: p.label, calls: p.count }));
  }, [activity, filter]);

  const siteVisitsInPeriod = useMemo(() => {
    const range = periodToRange(filter);
    return allVisits.filter((v) => inRange(v.visitDate, range)).length;
  }, [allVisits, filter]);

  return { filter, setFilter, chartData, cohort, siteVisitsInPeriod, activityDates: activity.map((e) => e.createdAt) };
}
