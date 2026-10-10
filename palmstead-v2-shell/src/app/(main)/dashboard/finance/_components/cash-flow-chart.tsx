"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import { ghs } from "@/lib/palmstead/format";

// Adapted from the shell's own real finance-v1 template
// (dashboard/(legacy)/finance-v1/_components/cash-flow-overview.tsx) --
// same real bar-chart layout, swapped from fake chartData to the real
// 6-month collected-vs-expenses trend from use-finance-overview.ts.
const chartConfig = {
  collected: { label: "Collected", color: "var(--chart-1)" },
  expenses: { label: "Expenses", color: "var(--chart-2)" },
} as ChartConfig;

function monthShort(mk: string): string {
  return new Date(`${mk}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" });
}

export function CashFlowChart({ data, isManager }: { data: { month: string; collected: number; expenses: number }[]; isManager: boolean }) {
  const totalCollected = data.reduce((s, d) => s + d.collected, 0);
  const totalExpenses = data.reduce((s, d) => s + d.expenses, 0);
  const chartData = data.map((d) => ({ month: monthShort(d.month), collected: d.collected, expenses: -d.expenses }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Flow — last 6 months</CardTitle>
        <CardDescription>{isManager ? "Company-wide collected payments vs approved expenses." : "Your own collected payments vs logged expenses."}</CardDescription>
      </CardHeader>
      <CardContent>
        <Separator />
        <div className="flex items-start justify-between gap-2 py-5 md:items-stretch md:gap-0">
          <div className="flex flex-1 items-center justify-center gap-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chart-1">
              <ArrowDownLeft className="size-6 stroke-background" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">Collected</p>
              <p className="font-medium tabular-nums">{ghs(totalCollected)}</p>
            </div>
          </div>
          <Separator orientation="vertical" className="h-auto! self-stretch" />
          <div className="flex flex-1 items-center justify-center gap-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chart-2">
              <ArrowUpRight className="size-6 stroke-background" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">Expenses</p>
              <p className="font-medium tabular-nums">{ghs(totalExpenses)}</p>
            </div>
          </div>
        </div>
        <Separator />
        <ChartContainer className="max-h-72 w-full" config={chartConfig}>
          <BarChart stackOffset="sign" margin={{ left: -25, right: 0, top: 25, bottom: 0 }} accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(value: number) => {
                const abs = Math.abs(value);
                const formatted = abs >= 1000 ? `${abs / 1000}k` : `${abs}`;
                return value < 0 ? `-${formatted}` : formatted;
              }}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="collected" stackId="a" fill={chartConfig.collected.color} radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" stackId="a" fill={chartConfig.expenses.color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
