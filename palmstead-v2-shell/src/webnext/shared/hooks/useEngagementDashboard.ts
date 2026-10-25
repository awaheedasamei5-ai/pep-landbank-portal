"use client";

import { useMemo, useState } from "react";
import type { ActivityLogEntry, Lead, Payment, SiteVisit } from "../../types/domain";
import { getOpenFollowUps } from "../lib/callActivityLogic";
import {
  activeDaysCount,
  avgPerActiveDay,
  bucketByDayOfMonth,
  bucketByMonthOfYear,
  defaultPeriodFilter,
  filterDatesInRange,
  inRange,
  periodToRange,
  type PeriodFilter,
} from "../lib/engagementPeriod";
import { today } from "../lib/format";

// docs/plans/29-company-leads-full-system-blueprint.md, generalized for
// Pipeline (My + Master) and Client Database -- the real
// UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx Dashboard tab (12 period-aware
// KPI tiles + day-by-day/calls-by-month charts), as a pure function of
// already-fetched, already-scoped data. The CALLER decides scope (a
// staff member's own leads, every company lead, every lead company-wide
// for a manager) by what it passes in here -- this hook holds no
// data-fetching or RLS assumptions of its own.
export function useEngagementDashboard(leads: Lead[], activity: ActivityLogEntry[], visits: SiteVisit[], payments: Payment[]) {
  const [filter, setFilter] = useState<PeriodFilter>(defaultPeriodFilter());

  const metrics = useMemo(() => {
    const leadIds = new Set(leads.map((l) => l.id));
    const allVisits = visits.filter((v) => v.leadId && leadIds.has(v.leadId));
    const allPayments = payments.filter((p) => p.leadId && leadIds.has(p.leadId) && (p.status ?? "approved") === "approved");

    const range = periodToRange(filter);
    const callsInPeriod = activity.filter((e) => inRange(e.createdAt, range));
    const callDates = callsInPeriod.map((e) => e.createdAt);
    const callDays = activeDaysCount(callDates);
    const visitsInPeriod = allVisits.filter((v) => inRange(v.visitDate, range));
    const cashInPeriod = allPayments.filter((p) => inRange(p.date, range)).reduce((s, p) => s + p.amount, 0);

    const visitedLeadIds = new Set(allVisits.map((v) => v.leadId as string));
    const purchased = leads.filter((l) => l.grandTotal > 0 && l.amtPaid >= l.grandTotal);
    const boughtCount = purchased.length;
    const notBoughtCount = leads.length - boughtCount;

    const outstandingBalance = leads.reduce((s, l) => s + Math.max(l.grandTotal - l.amtPaid, 0), 0);
    const activeDeals = leads.filter((l) => l.amtPaid > 0 && l.amtPaid < l.grandTotal).length;

    const openFollowUps = getOpenFollowUps(activity);
    const todayIso = today();
    const followUpsDue = openFollowUps.filter((f) => f.follow <= todayIso).length;

    const dayChart = filter.month === "all" ? bucketByMonthOfYear(filterDatesInRange(callDates, range), filter.year) : bucketByDayOfMonth(callDates, filter.year, filter.month);
    const monthChart = bucketByMonthOfYear(
      activity.map((e) => e.createdAt),
      filter.year,
    );

    return {
      callsLogged: callsInPeriod.length,
      avgCallsPerActiveDay: avgPerActiveDay(callsInPeriod.length, callDays),
      siteVisitsInPeriod: visitsInPeriod.length,
      clientsEverVisited: visitedLeadIds.size,
      boughtClients: boughtCount,
      notYetBought: notBoughtCount,
      cashInPeriod,
      outstandingBalance,
      clientsInRegister: leads.length,
      openFollowUpsDue: followUpsDue,
      activeDeals,
      callDaysInPeriod: callDays,
      dayChart,
      monthChart,
    };
  }, [leads, activity, visits, payments, filter]);

  return { filter, setFilter, metrics, activityDates: activity.map((e) => e.createdAt) };
}

export type EngagementDashboardMetrics = ReturnType<typeof useEngagementDashboard>["metrics"];
