"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ghs } from "@/lib/palmstead/format";
import { useManagerOverview } from "@/lib/palmstead/use-manager-overview";

// Approved payments only, grouped by month from the role-scoped overview.
function trailingMonthLabels(): string[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return d.toLocaleDateString("en-GB", { month: "short" });
  });
}

const chartConfig = {
  collected: { label: "Collected", color: "#f15b39" },
} satisfies ChartConfig;

export function PerformanceOverview() {
  const { data, isLoading } = useManagerOverview();
  const trend = data?.collectedTrend ?? [];
  const labels = trailingMonthLabels();
  const chartData = labels.map((label, i) => ({ month: label, collected: trend[i] ?? 0 }));
  const currentMonth = trend[trend.length - 1] ?? 0;
  const prevMonth = trend[trend.length - 2] ?? 0;
  const delta = currentMonth - prevMonth;
  const hasCollections = trend.some((amount) => amount > 0);

  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label="Approved collections trend">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">Collected this month</h2>
        <span className="text-sm font-semibold tabular-nums">{isLoading ? "Loading…" : ghs(currentMonth)}</span>
      </div>
      {delta !== 0 && !isLoading && <p className="text-xs text-muted-foreground">{delta > 0 ? "▲" : "▼"} {ghs(Math.abs(delta))} vs last month</p>}
      {!isLoading && !hasCollections ? <p className="flex min-h-28 items-center text-sm text-muted-foreground">No approved payments in the last six months.</p> : <ChartContainer config={chartConfig} className="aspect-auto h-32 w-full sm:h-36 lg:h-28">
          <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fillCollected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-collected)" stopOpacity={0.36} />
                <stop offset="95%" stopColor="var(--color-collected)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.35} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={5} fontSize={10} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent className="w-40" indicator="line" formatter={(value) => ghs(value as number)} />
              }
            />
            <Area
              dataKey="collected"
              type="monotone"
              fill="url(#fillCollected)"
              stroke="var(--color-collected)"
              strokeWidth={1.5}
              dot={false}
              fillOpacity={1}
              isAnimationActive="auto"
            />
          </AreaChart>
        </ChartContainer>}
      <p className="text-xs text-muted-foreground">Approved payments · last six months</p>
    </section>
  );
}

