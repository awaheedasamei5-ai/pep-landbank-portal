"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ghs } from "@/lib/palmstead/format";
import { useManagerOverview } from "@/lib/palmstead/use-manager-overview";

// Real "collected this month" trend -- approved payments only (the same
// real app-wide rule every other Palmstead report uses: a pending
// payment doesn't count as collected until a manager approves it),
// grouped by month straight from the payments table. Replaces the
// template's fake 6-month "Customer Activity" multi-series chart.
function trailingMonthLabels(): string[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return d.toLocaleDateString("en-GB", { month: "short" });
  });
}

const chartConfig = {
  collected: { label: "Collected", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function PerformanceOverview() {
  const { data, isLoading } = useManagerOverview();
  const trend = data?.collectedTrend ?? [];
  const labels = trailingMonthLabels();
  const chartData = labels.map((label, i) => ({ month: label, collected: trend[i] ?? 0 }));
  const currentMonth = trend[trend.length - 1] ?? 0;
  const prevMonth = trend[trend.length - 2] ?? 0;
  const delta = currentMonth - prevMonth;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="leading-none">Collected this month</CardTitle>
        <CardDescription>
          {isLoading ? (
            "Loading…"
          ) : (
            <>
              {ghs(currentMonth)}
              {delta !== 0 && (
                <span className={delta > 0 ? "ml-2 text-emerald-600" : "ml-2 text-red-600"}>
                  {delta > 0 ? "▲" : "▼"} {ghs(Math.abs(delta))} vs last month
                </span>
              )}
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
          <AreaChart data={chartData} margin={{ top: 0 }}>
            <defs>
              <linearGradient id="fillCollected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-collected)" stopOpacity={0.36} />
                <stop offset="95%" stopColor="var(--color-collected)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.5} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent className="w-40" indicator="line" formatter={(value) => ghs(value as number)} />
              }
            />
            <Area
              dataKey="collected"
              type="natural"
              fill="url(#fillCollected)"
              stroke="var(--color-collected)"
              strokeWidth={1.5}
              dot={false}
              fillOpacity={1}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
