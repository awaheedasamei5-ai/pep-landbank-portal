"use client";

import { useMemo, useState } from "react";
import type { ActivityLogEntry, Lead, Payment, SiteVisit } from "../../types/domain";
import { activeDaysCount, availableYears, avgPerActiveDay, defaultPeriodFilter, inRange, periodToRange, type PeriodFilter } from "../lib/engagementPeriod";

// docs/plans/29-company-leads-full-system-blueprint.md Section 1.3 / 7.3,
// generalized for Pipeline and Client Database -- the real
// UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx Analytics tab: three real
// comparison tables (Day / Month / Year). Takes already-scoped data,
// same pattern as useEngagementDashboard -- the caller decides scope.

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

export function useEngagementAnalytics(leads: Lead[], activity: ActivityLogEntry[], visits: SiteVisit[], payments: Payment[]) {
  const [filter, setFilter] = useState<PeriodFilter>(defaultPeriodFilter());

  const leadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads]);
  const allVisits = useMemo(() => visits.filter((v) => v.leadId && leadIds.has(v.leadId)), [visits, leadIds]);
  const allPayments = useMemo(() => payments.filter((p) => p.leadId && leadIds.has(p.leadId) && (p.status ?? "approved") === "approved"), [payments, leadIds]);

  // Day table -- one row per calendar day of the selected month (or, when
  // Month="all", falls back to the current real month so the Day tab
  // always has a real month to show).
  const dayRows = useMemo<DayAnalyticsRow[]>(() => {
    const month = filter.month === "all" ? new Date().getMonth() + 1 : filter.month;
    const year = filter.year;
    const days = new Date(year, month, 0).getDate();
    const counts = new Map<string, number>();
    for (const e of activity) {
      const key = e.createdAt.slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const rows: DayAnalyticsRow[] = [];
    for (let d = 1; d <= days; d++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      rows.push({ day: d, date, calls: counts.get(date) ?? 0 });
    }
    return rows;
  }, [activity, filter.year, filter.month]);

  // Month table -- one row per calendar month of the selected year.
  const monthRows = useMemo<MonthAnalyticsRow[]>(() => {
    const year = filter.year;
    return MONTH_NAMES.map((name, i) => {
      const m = i + 1;
      const range = periodToRange({ granularity: "month", year, month: m });
      const callsThisMonth = activity.filter((e) => inRange(e.createdAt, range));
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
  }, [activity, allVisits, allPayments, filter.year]);

  // Year table -- all-time, one row per calendar year seen in the real
  // data (plus the current year), independent of the Dashboard's own
  // Year/Month selector -- exactly how the workbook's year table behaves.
  const yearRows = useMemo<YearAnalyticsRow[]>(() => {
    const allDates = [...leads.map((l) => l.date), ...activity.map((e) => e.createdAt), ...allVisits.map((v) => v.visitDate), ...allPayments.map((p) => p.date)];
    const years = availableYears(allDates);
    return years
      .slice()
      .sort((a, b) => a - b)
      .map((year) => {
        const range = { from: `${year}-01-01`, to: `${year}-12-31` };
        return {
          year,
          newClients: leads.filter((l) => inRange(l.date, range)).length,
          calls: activity.filter((e) => inRange(e.createdAt, range)).length,
          siteVisits: allVisits.filter((v) => inRange(v.visitDate, range)).length,
          cashIn: allPayments.filter((p) => inRange(p.date, range)).reduce((s, p) => s + p.amount, 0),
        };
      });
  }, [leads, activity, allVisits, allPayments]);

  return {
    filter,
    setFilter,
    dayRows,
    monthRows,
    yearRows,
    activityDates: activity.map((e) => e.createdAt),
  };
}
