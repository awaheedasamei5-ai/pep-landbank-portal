"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ghs } from "@/lib/palmstead/format";

// Adapted from the shell's own real finance-v1 template
// (dashboard/(legacy)/finance-v1/_components/spending-breakdown.tsx) --
// same real segmented-bar + legend layout, swapped from fake expense rows
// to this month's real approved expenses grouped by category.
export function ExpenseCategoryBreakdown({ data }: { data: { category: string; amount: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense breakdown</CardTitle>
        <CardDescription>This month's approved spend by category.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No approved expenses this month yet.</p>
        ) : (
          <>
            <div className="space-y-1">
              <div className="font-medium text-2xl">{ghs(total)}</div>
              <div className="flex h-6 w-full overflow-hidden rounded-md">
                {data.map((item, index) => {
                  const width = (item.amount / total) * 100;
                  const alpha = Math.max(0.35, 1 - index * 0.12);
                  return (
                    <div
                      key={item.category}
                      className="h-full shrink-0 border-background border-l first:border-l-0"
                      style={{ width: `${width}%`, background: `color-mix(in oklch, var(--primary) ${alpha * 100}%, transparent)` }}
                      title={`${item.category}: ${ghs(item.amount)}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              {data.map((item, index) => {
                const pct = Math.round((item.amount / total) * 100);
                const alpha = Math.max(0.35, 1 - index * 0.12);
                return (
                  <div key={item.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-3 rounded-sm" style={{ background: `color-mix(in oklch, var(--primary) ${alpha * 100}%, transparent)` }} />
                      <span className="text-muted-foreground text-sm">{item.category}</span>
                    </div>
                    <span className="font-medium text-sm tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
