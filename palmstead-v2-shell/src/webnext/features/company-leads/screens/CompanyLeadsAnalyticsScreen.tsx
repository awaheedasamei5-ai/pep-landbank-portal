"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PageHeader } from "@/components/page-header";
import { ghs } from "../../../shared/lib/format";
import { useCompanyLeadsAnalytics } from "../hooks/useCompanyLeadsAnalytics";
import { PeriodFilterBar } from "../components/PeriodFilterBar";
import styles from "./CallLogScreen.module.css";

const callsConfig = { calls: { label: "Calls", color: "var(--chart-1)" } } satisfies ChartConfig;
const cashConfig = { cashIn: { label: "Cash in", color: "var(--chart-2)" } } satisfies ChartConfig;

// docs/plans/29-company-leads-full-system-blueprint.md Section 7.3 -- the
// real Analytics rebuild: Day/Month/Year tabs mirroring
// UNIFIED_CUSTOMER_ENGAGEMENT_SYSTEM.xlsx's own Analytics tab exactly,
// replacing Phase 3's single fixed 6-month screen.
export function CompanyLeadsAnalyticsScreen() {
  const { isLoading, filter, setFilter, dayRows, monthRows, yearRows, activityDates } = useCompanyLeadsAnalytics();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const dayChartData = dayRows.map((r) => ({ label: String(r.day), calls: r.calls }));
  const monthChartData = monthRows.map((r) => ({ label: r.month, calls: r.calls, cashIn: r.cashIn }));
  const yearChartData = yearRows.map((r) => ({ label: String(r.year), calls: r.calls, cashIn: r.cashIn }));

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/company-leads">
          <ArrowLeft />
          Company Leads
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Company Leads Analytics" description="Day, month and year comparisons -- calls, active days, site visits and cash, scoped to Company Leads clients only." />
        <PeriodFilterBar filter={filter} onChange={setFilter} activityDates={activityDates} showGranularityTabs={false} />
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
