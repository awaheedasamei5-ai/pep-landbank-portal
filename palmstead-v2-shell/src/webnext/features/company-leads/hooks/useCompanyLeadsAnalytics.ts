"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDataSource } from "../../../data/source";
import { useSessionStore } from "../../../auth/useSessionStore";
import { useCompanyLeads } from "./useCompanyLeads";
import { useCompanyWideActivity } from "./useCallLog";
import { activeDaysCount, availableYears, avgPerActiveDay, defaultPeriodFilter, inRange, periodToRange, type PeriodFilter } from "../lib/periodFilter";

// docs/plans/29-company-leads-full-system-blueprint.md Section 1.3 / 7.3 --
// the real UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx Analytics tab: three
// real comparison tables (Day / Month / Year), replacing the earlier
// Phase 3 screen's single fixed 6-month trend. Every row here is
// recomputed from the same real activity_log/site_visits/payments/leads
// data every other Company Leads screen already reads -- no new table.

export interface DayAnalyticsRow {
  day: number;
  date: string;
  calls: number;
}

export interface MonthAnalyticsRow {
  month: string;
  monthKey: string;
  calls: number;
  activeDays: number;
  avgCallsPerActiveDay: number;
  siteVisits: number;
  cashIn: number;
}

export interface YearAnalyticsRow {
  year: number;
  newClients: number;
  calls: number;
  siteVisits: number;
  cashIn: number;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function useCompanyLeadsAnalytics() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const [filter, setFilter] = useState<PeriodFilter>(defaultPeriodFilter());

  const { data: companyLeads, isLoading: leadsLoading } = useCompanyLeads();
  const { data: activity, isLoading: activityLoading } = useCompanyWideActivity();
  const siteVisitsQuery = useQuery({ queryKey: ["companyLeadsSiteVisits"], queryFn: () => getDataSource(demoMode).siteVisits.listAll() });
  const paymentsQuery = useQuery({ queryKey: ["companyLeadsPayments"], queryFn: () => getDataSource(demoMode).payments.listAll() });

  const isLoading = leadsLoading || activityLoading || siteVisitsQuery.isLoading || paymentsQuery.isLoading;

  const leads = companyLeads ?? [];
  const leadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads]);
  const allActivity = activity ?? [];
  const allVisits = useMemo(() => (siteVisitsQuery.data ?? []).filter((v) => v.leadId && leadIds.has(v.leadId)), [siteVisitsQuery.data, leadIds]);
  const allPayments = useMemo(
    () => (paymentsQuery.data ?? []).filter((p) => p.leadId && leadIds.has(p.leadId) && (p.status ?? "approved") === "approved"),
    [paymentsQuery.data, leadIds],
  );

  // Day table -- one row per calendar day of the selected month (or, when
  // Month="all", falls back to the current real month so the Day tab
  // always has a real month to show, matching the workbook's own "Daily
  // chart is blank when Month = 0" note by picking a sensible default
  // instead of rendering nothing).
  const dayRows = useMemo<DayAnalyticsRow[]>(() => {
    const month = filter.month === "all" ? new Date().getMonth() + 1 : filter.month;
    const year = filter.year;
    const days = new Date(year, month, 0).getDate();
    const counts = new Map<string, number>();
    for (const e of allActivity) {
      const key = e.createdAt.slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const rows: DayAnalyticsRow[] = [];
    for (let d = 1; d <= days; d++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      rows.push({ day: d, date, calls: counts.get(date) ?? 0 });
    }
    return rows;
  }, [allActivity, filter.year, filter.month]);

  // Month table -- one row per calendar month of the selected year.
  const monthRows = useMemo<MonthAnalyticsRow[]>(() => {
    const year = filter.year;
    return MONTH_NAMES.map((name, i) => {
      const m = i + 1;
      const range = periodToRange({ granularity: "month", year, month: m });
      const callsThisMonth = allActivity.filter((e) => inRange(e.createdAt, range));
      const activeDays = activeDaysCount(callsThisMonth.map((e) => e.createdAt));
      const visitsThisMonth = allVisits.filter((v) => inRange(v.visitDate, range));
      const cashThisMonth = allPayments.filter((p) => inRange(p.date, range)).reduce((s, p) => s + p.amount, 0);
      return {
        month: name,
        monthKey: `${year}-${String(m).padStart(2, "0")}`,
        calls: callsThisMonth.length,
        activeDays,
        avgCallsPerActiveDay: avgPerActiveDay(callsThisMonth.length, activeDays),
        siteVisits: visitsThisMonth.length,
        cashIn: cashThisMonth,
      };
    });
  }, [allActivity, allVisits, allPayments, filter.year]);

  // Year table -- all-time, one row per calendar year seen in the real
  // data (plus the current year), independent of the Dashboard's own
  // Year/Month selector -- exactly how the workbook's year table behaves.
  const yearRows = useMemo<YearAnalyticsRow[]>(() => {
    const allDates = [...leads.map((l) => l.date), ...allActivity.map((e) => e.createdAt), ...allVisits.map((v) => v.visitDate), ...allPayments.map((p) => p.date)];
    const years = availableYears(allDates);
    return years
      .slice()
      .sort((a, b) => a - b)
      .map((year) => {
        const range = { from: `${year}-01-01`, to: `${year}-12-31` };
        return {
          year,
          newClients: leads.filter((l) => inRange(l.date, range)).length,
          calls: allActivity.filter((e) => inRange(e.createdAt, range)).length,
          siteVisits: allVisits.filter((v) => inRange(v.visitDate, range)).length,
          cashIn: allPayments.filter((p) => inRange(p.date, range)).reduce((s, p) => s + p.amount, 0),
        };
      });
  }, [leads, allActivity, allVisits, allPayments]);

  return {
    isLoading,
    filter,
    setFilter,
    dayRows,
    monthRows,
    yearRows,
    activityDates: allActivity.map((e) => e.createdAt),
  };
}
