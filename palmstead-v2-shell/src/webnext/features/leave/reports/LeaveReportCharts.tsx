"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { LeaveReport } from "./leaveReport";

// Adapts the existing shell Finance cash-flow chart composition to the
// authorized Leave selector output. Figures are shared with the table/PDF.
export default function LeaveReportCharts({ report }: { report: LeaveReport }) {
  const config = {
    current: { label: String(report.filters.year), color: "var(--chart-1)" },
    previous: { label: report.comparisonLabel, color: "var(--chart-2)" },
  };
  const data = report.months.map((row) => ({
    ...row,
    label: new Date(Date.UTC(2026, row.month - 1, 1)).toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
  }));
  return (
    <div className="mb-6 space-y-3">
      <h3 className="font-medium">Approved scheduled employee-dates</h3>
      <p className="text-muted-foreground text-sm">
        {report.comparisonLabel}: {report.prior.start} to {report.prior.end}; current request statuses. Zero bars mean
        no recorded matching activity. Future scheduled dates may be included. Exact figures are in the comparison table
        below.
      </p>
      <ChartContainer
        config={config}
        className="aspect-auto h-72 w-full"
        aria-label="Monthly approved leave comparison"
      >
        <BarChart data={data} accessibilityLayer margin={{ left: -20, right: 8, top: 12, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} domain={[0, "auto"]} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="current" fill="var(--color-current)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="previous" fill="var(--color-previous)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <section
        className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-sm"
        aria-label="Request status distribution"
      >
        {report.distribution.map((row) => (
          <span key={row.status}>
            <span className="capitalize">{row.status}</span>: <strong>{row.requests}</strong> requests
          </span>
        ))}
      </section>
    </div>
  );
}
