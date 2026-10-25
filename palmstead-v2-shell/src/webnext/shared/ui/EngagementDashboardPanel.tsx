"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ghs } from "../lib/format";
import type { ActivityLogEntry, Lead, Payment, SiteVisit } from "../../types/domain";
import { useEngagementDashboard } from "../hooks/useEngagementDashboard";
import { EngagementPeriodFilterBar } from "./EngagementPeriodFilterBar";
import styles from "./EngagementDashboardPanel.module.css";

const dayChartConfig = { count: { label: "Calls", color: "var(--chart-1)" } } satisfies ChartConfig;
const monthChartConfig = { count: { label: "Calls", color: "var(--chart-2)" } } satisfies ChartConfig;

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.2,
// generalized for Pipeline and Client Database -- the real
// UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx Dashboard tab (12 KPI tiles in
// two real rows + two charts). Takes already-scoped data (own leads,
// company-wide leads, or a single feature's leads) rather than fetching
// anything itself -- every app wraps this with its own thin data-fetching
// component, same as CompanyLeadsDashboardPanel does.
export function EngagementDashboardPanel({
  leads,
  activity,
  visits,
  payments,
  isLoading,
  heading = "Engagement dashboard",
}: {
  leads: Lead[];
  activity: ActivityLogEntry[];
  visits: SiteVisit[];
  payments: Payment[];
  isLoading?: boolean;
  heading?: string;
}) {
  const { filter, setFilter, metrics, activityDates } = useEngagementDashboard(leads, activity, visits, payments);

  if (isLoading) {
    return <p className={styles.loading}>Loading dashboard…</p>;
  }

  const row1 = [
    { label: "Calls logged", value: String(metrics.callsLogged) },
    { label: "Avg calls / active day", value: metrics.avgCallsPerActiveDay.toFixed(1) },
    { label: "Site visits in period", value: String(metrics.siteVisitsInPeriod) },
    { label: "Clients ever visited", value: String(metrics.clientsEverVisited) },
    { label: "Bought clients", value: String(metrics.boughtClients) },
    { label: "Not yet bought", value: String(metrics.notYetBought) },
  ];
  const row2 = [
    { label: "Cash in — period", value: ghs(metrics.cashInPeriod) },
    { label: "Outstanding balance", value: ghs(metrics.outstandingBalance) },
    { label: "Clients in register", value: String(metrics.clientsInRegister) },
    { label: "Open follow-ups due", value: String(metrics.openFollowUpsDue), warn: metrics.openFollowUpsDue > 0 },
    { label: "Active deals", value: String(metrics.activeDeals) },
    { label: "Call days in period", value: String(metrics.callDaysInPeriod) },
  ];

  return (
    <section className={styles.wrap}>
      <div className={styles.filterRow}>
        <h2 className={styles.heading}>{heading}</h2>
        <EngagementPeriodFilterBar filter={filter} onChange={setFilter} activityDates={activityDates} showGranularityTabs={false} />
      </div>

      <div className={styles.tileGrid}>
        {[...row1, ...row2].map((t) => (
          <div key={t.label} className={styles.tile}>
            <div className={`${styles.tileValue} ${"warn" in t && t.warn ? styles.tileValueWarn : ""}`}>{t.value}</div>
            <div className={styles.tileLabel}>{t.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.chartGrid}>
        <Card>
          <CardHeader>
            <CardTitle className="font-normal">Call activity — day by day</CardTitle>
            <CardDescription>{filter.month === "all" ? `Months of ${filter.year}` : "Selected month"}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={dayChartConfig} className="aspect-auto h-52 w-full">
              <BarChart data={metrics.dayChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.5} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} interval={metrics.dayChart.length > 20 ? 2 : 0} />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent className="w-32" />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={3} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-normal">Calls by month</CardTitle>
            <CardDescription>{filter.year}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={monthChartConfig} className="aspect-auto h-52 w-full">
              <BarChart data={metrics.monthChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.5} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent className="w-32" />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={3} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
