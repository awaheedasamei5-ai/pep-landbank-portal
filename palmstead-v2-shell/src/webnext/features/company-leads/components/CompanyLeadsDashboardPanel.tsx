"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ghs } from "../../../shared/lib/format";
import { useCompanyLeadsDashboard } from "../hooks/useCompanyLeadsDashboard";
import { PeriodFilterBar } from "./PeriodFilterBar";
import styles from "./CompanyLeadsDashboardPanel.module.css";

const dayChartConfig = { count: { label: "Calls", color: "var(--chart-1)" } } satisfies ChartConfig;
const monthChartConfig = { count: { label: "Calls", color: "var(--chart-2)" } } satisfies ChartConfig;

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.2 -- the
// real UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx Dashboard tab (12 KPI tiles
// in two real rows + two charts), sitting above the existing pipeline-value
// KPI strip rather than replacing it -- that strip stays for parity with
// Master Pipeline's own screen; this is the engagement-activity layer the
// workbook's Dashboard tab actually covers.
export function CompanyLeadsDashboardPanel() {
  const { isLoading, filter, setFilter, metrics, activityDates } = useCompanyLeadsDashboard();

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
        <h2 className={styles.heading}>Engagement dashboard</h2>
        <PeriodFilterBar filter={filter} onChange={setFilter} activityDates={activityDates} showGranularityTabs={false} />
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
