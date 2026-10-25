"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ghs } from "../lib/format";
import type { ActivityLogEntry, Lead, Payment, SiteVisit } from "../../types/domain";
import { useEngagementAnalytics } from "../hooks/useEngagementAnalytics";
import { EngagementPeriodFilterBar } from "./EngagementPeriodFilterBar";
import styles from "./staggerEnter.module.css";

const callsConfig = { calls: { label: "Calls", color: "var(--chart-1)" } } satisfies ChartConfig;
const cashConfig = { cashIn: { label: "Cash in", color: "var(--chart-2)" } } satisfies ChartConfig;

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.3,
// generalized for Pipeline and Client Database -- the real Day/Month/Year
// Analytics tabs mirroring UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx's own
// Analytics tab exactly. Takes already-scoped data, same pattern as
// EngagementDashboardPanel -- the caller decides scope.
export function EngagementAnalyticsTabs({
  leads,
  activity,
  visits,
  payments,
  isLoading,
}: {
  leads: Lead[];
  activity: ActivityLogEntry[];
  visits: SiteVisit[];
  payments: Payment[];
  isLoading?: boolean;
}) {
  const { filter, setFilter, dayRows, monthRows, yearRows, activityDates } = useEngagementAnalytics(leads, activity, visits, payments);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const dayChartData = dayRows.map((r) => ({ label: String(r.day), calls: r.calls }));
  const monthChartData = monthRows.map((r) => ({ label: r.month, calls: r.calls, cashIn: r.cashIn }));
  const yearChartData = yearRows.map((r) => ({ label: String(r.year), calls: r.calls, cashIn: r.cashIn }));

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <EngagementPeriodFilterBar filter={filter} onChange={setFilter} activityDates={activityDates} showGranularityTabs={false} />
      </div>

      <Tabs defaultValue="day">
        <TabsList>
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
        </TabsList>

        <TabsContent value="day" className="space-y-4">
          <Card className={styles.section} style={{ "--stagger-index": 0 } as React.CSSProperties}>
            <CardHeader>
              <CardTitle className="font-normal">Calls by day</CardTitle>
              <CardDescription>{filter.month === "all" ? "Current month" : `${filter.year}, selected month`}</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={callsConfig} className="aspect-auto h-56 w-full">
                <BarChart data={dayChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.5} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} interval={2} />
                  <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent className="w-32" />} />
                  <Bar dataKey="calls" fill="var(--color-calls)" radius={3} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card className={styles.section}>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayRows.map((r) => (
                    <TableRow key={r.date}>
                      <TableCell>{r.day}</TableCell>
                      <TableCell className="text-muted-foreground">{r.date}</TableCell>
                      <TableCell className="text-right font-mono">{r.calls}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="month" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className={styles.section} style={{ "--stagger-index": 0 } as React.CSSProperties}>
              <CardHeader>
                <CardTitle className="font-normal">Calls by month</CardTitle>
                <CardDescription>{filter.year}</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={callsConfig} className="aspect-auto h-52 w-full">
                  <BarChart data={monthChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.5} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent className="w-32" />} />
                    <Bar dataKey="calls" fill="var(--color-calls)" radius={3} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card className={styles.section} style={{ "--stagger-index": 1 } as React.CSSProperties}>
              <CardHeader>
                <CardTitle className="font-normal">Cash in by month</CardTitle>
                <CardDescription>{filter.year}, approved payments</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={cashConfig} className="aspect-auto h-52 w-full">
                  <BarChart data={monthChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.5} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent className="w-40" formatter={(value) => ghs(value as number)} />} />
                    <Bar dataKey="cashIn" fill="var(--color-cashIn)" radius={3} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
          <Card className={styles.section}>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Active days</TableHead>
                    <TableHead className="text-right">Avg calls / active day</TableHead>
                    <TableHead className="text-right">Site visits</TableHead>
                    <TableHead className="text-right">Cash in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthRows.map((r) => (
                    <TableRow key={r.monthKey}>
                      <TableCell className="font-medium">{r.month}</TableCell>
                      <TableCell className="text-right font-mono">{r.calls}</TableCell>
                      <TableCell className="text-right font-mono">{r.activeDays}</TableCell>
                      <TableCell className="text-right font-mono">{r.avgCallsPerActiveDay.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-mono">{r.siteVisits}</TableCell>
                      <TableCell className="text-right font-mono">{ghs(r.cashIn)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="year" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className={styles.section} style={{ "--stagger-index": 0 } as React.CSSProperties}>
              <CardHeader>
                <CardTitle className="font-normal">Calls by year</CardTitle>
                <CardDescription>All time</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={callsConfig} className="aspect-auto h-52 w-full">
                  <BarChart data={yearChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.5} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent className="w-32" />} />
                    <Bar dataKey="calls" fill="var(--color-calls)" radius={3} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card className={styles.section} style={{ "--stagger-index": 1 } as React.CSSProperties}>
              <CardHeader>
                <CardTitle className="font-normal">Cash in by year</CardTitle>
                <CardDescription>All time, approved payments</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={cashConfig} className="aspect-auto h-52 w-full">
                  <BarChart data={yearChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.5} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent className="w-40" formatter={(value) => ghs(value as number)} />} />
                    <Bar dataKey="cashIn" fill="var(--color-cashIn)" radius={3} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
          <Card className={styles.section}>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">New clients</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Site visits</TableHead>
                    <TableHead className="text-right">Cash in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearRows.map((r) => (
                    <TableRow key={r.year}>
                      <TableCell className="font-medium">{r.year}</TableCell>
                      <TableCell className="text-right font-mono">{r.newClients}</TableCell>
                      <TableCell className="text-right font-mono">{r.calls}</TableCell>
                      <TableCell className="text-right font-mono">{r.siteVisits}</TableCell>
                      <TableCell className="text-right font-mono">{ghs(r.cashIn)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
