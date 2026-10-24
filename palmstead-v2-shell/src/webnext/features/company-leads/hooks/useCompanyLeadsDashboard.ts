"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDataSource } from "../../../data/source";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useCompanyLeads } from "./useCompanyLeads";
import { useCompanyWideActivity } from "./useCallLog";
import { getOpenFollowUps } from "../lib/callLogLogic";
import { activeDaysCount, avgPerActiveDay, bucketByDayOfMonth, bucketByMonthOfYear, defaultPeriodFilter, filterDatesInRange, inRange, periodToRange, type PeriodFilter } from "../lib/periodFilter";
import { today } from "../../../shared/lib/format";

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.2 -- the
// real UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx Dashboard tab, translated:
// 12 period-aware KPI tiles (Section 1.2) plus the two charts (day-by-day
// for the selected month, calls-by-month for the selected year), all
// reusing data this app already fetches real-time -- no new table.
export function useCompanyLeadsDashboard() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const [filter, setFilter] = useState<PeriodFilter>(defaultPeriodFilter());

  // The Dashboard only ever shows Year + Month(=all) -- PeriodFilterBar
  // hides the Day/Week/Year/Custom granularity tabs here (showGranularityTabs
  // ={false}), so granularity itself never changes away from "month" on
  // this screen and periodToRange() always reads the real selected month
  // (or the whole year when Month="all"), matching the workbook exactly.
  const { data: companyLeads, isLoading: leadsLoading } = useCompanyLeads();
  const { data: activity, isLoading: activityLoading } = useCompanyWideActivity();
  const siteVisitsQuery = useQuery({ queryKey: ["companyLeadsSiteVisits"], queryFn: () => getDataSource(demoMode).siteVisits.listAll() });
  const paymentsQuery = useQuery({ queryKey: ["companyLeadsPayments"], queryFn: () => getDataSource(demoMode).payments.listAll() });

  const isLoading = leadsLoading || activityLoading || siteVisitsQuery.isLoading || paymentsQuery.isLoading;

  const metrics = useMemo(() => {
    const leads = companyLeads ?? [];
    const leadIds = new Set(leads.map((l) => l.id));
    const allActivity = activity ?? [];
    const allVisits = (siteVisitsQuery.data ?? []).filter((v) => v.leadId && leadIds.has(v.leadId));
    const allPayments = (paymentsQuery.data ?? []).filter((p) => p.leadId && leadIds.has(p.leadId) && (p.status ?? "approved") === "approved");

    const range = periodToRange(filter);
    const callsInPeriod = allActivity.filter((e) => inRange(e.createdAt, range));
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

    const openFollowUps = getOpenFollowUps(allActivity);
    const todayIso = today();
    const followUpsDue = openFollowUps.filter((f) => f.follow <= todayIso).length;

    const dayChart = filter.month === "all" ? bucketByMonthOfYear(filterDatesInRange(callDates, range), filter.year) : bucketByDayOfMonth(callDates, filter.year, filter.month);
    const monthChart = bucketByMonthOfYear(
      allActivity.map((e) => e.createdAt),
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
  }, [companyLeads, activity, siteVisitsQuery.data, paymentsQuery.data, filter]);

  return { isLoading, filter, setFilter, metrics, activityDates: (activity ?? []).map((e) => e.createdAt) };
}
