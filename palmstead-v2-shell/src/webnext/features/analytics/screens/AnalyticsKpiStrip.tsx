'use client';

import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface KpiStripItem {
  key: string;
  label: string;
  value: string;
  deltaPct: number | null;
  fromLabel?: string;
  periodLabel?: string;
}

// docs/plans/27-analytics-v2-cross-app-plan.md -- real, already-shipped
// shadcn-admin-dashboard template pattern (src/app/(main)/dashboard/
// analytics/_components/analytics-kpi-strip.tsx, orphaned since
// Analytics v1 replaced that route's page.tsx) -- a single divided card
// rather than separate Cards, each metric with a trend badge and a
// plain-English "from X · period" caption. Reused across every
// Analytics v2 tab instead of forked per-tab.
export function AnalyticsKpiStrip({ items }: { items: KpiStripItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
      <div className="grid grid-cols-1 divide-y *:data-[slot=card]:rounded-none *:data-[slot=card]:ring-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-flow-col lg:auto-cols-fr">
        {items.map((item) => (
          <Card key={item.key}>
            <CardHeader>
              <CardTitle className="font-normal text-sm">{item.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-2xl leading-none tracking-tight">{item.value}</div>
                {item.deltaPct != null && (
                  <Badge className={item.deltaPct >= 0 ? 'bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-destructive/10 text-destructive'}>
                    {item.deltaPct >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}
                    {Math.abs(item.deltaPct)}%
                  </Badge>
                )}
              </div>
              {(item.fromLabel || item.periodLabel) && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  {item.fromLabel && (
                    <span>
                      from <span className="text-foreground">{item.fromLabel}</span>
                    </span>
                  )}
                  {item.fromLabel && item.periodLabel && <span>•</span>}
                  {item.periodLabel && <span>{item.periodLabel}</span>}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
