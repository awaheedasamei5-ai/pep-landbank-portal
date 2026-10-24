'use client';

import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AnalyticsKpiStrip, type KpiStripItem } from './AnalyticsKpiStrip';
import { useTeamAnalytics } from '../hooks/useTeamAnalytics';
import { useAnalyticsTabNarration } from '../hooks/useAnalyticsTabNarration';
import styles from './AnalyticsScreen.module.css';

const trendConfig = {
  signIns: { label: 'Sign-ins', color: 'var(--chart-1)' },
} satisfies ChartConfig;

// docs/plans/27-analytics-v2-cross-app-plan.md -- real cross-app Team
// tab: Attendance + Leave, neither covered by the original Analytics.
export function TeamTab() {
  const { isLoading, metrics } = useTeamAnalytics();

  const context = !isLoading
    ? {
        daysAttended: metrics.daysAttended,
        onTimePct: metrics.onTimePct,
        leaveRequests: metrics.leaveRequests,
        leaveDays: metrics.leaveDays,
      }
    : null;
  const { data: narration } = useAnalyticsTabNarration('analytics_team_summary', context);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const items: KpiStripItem[] = [
    { key: 'daysAttended', label: 'Days attended (co-wide)', value: String(metrics.daysAttended.current), deltaPct: metrics.daysAttended.deltaPct, fromLabel: String(metrics.daysAttended.previous), periodLabel: 'this month' },
    { key: 'onTimePct', label: 'On-time rate', value: `${metrics.onTimePct.current}%`, deltaPct: metrics.onTimePct.deltaPct, fromLabel: `${metrics.onTimePct.previous}%`, periodLabel: 'this month' },
    { key: 'leaveRequests', label: 'Leave requests', value: String(metrics.leaveRequests.current), deltaPct: metrics.leaveRequests.deltaPct, fromLabel: String(metrics.leaveRequests.previous), periodLabel: 'this month' },
    { key: 'leaveDays', label: 'Leave days taken', value: String(metrics.leaveDays.current), deltaPct: metrics.leaveDays.deltaPct, fromLabel: String(metrics.leaveDays.previous), periodLabel: 'this month' },
  ];

  const chartData = metrics.dailyTrend.map(([date, count]) => ({ day: date.slice(8, 10), signIns: count }));

  return (
    <div className="space-y-4">
      {narration && (
        <Card className={`${styles.section} ${styles.briefingCard}`} style={{ '--stagger-index': 0 } as React.CSSProperties}>
          <CardContent className="flex items-start gap-2 pt-6 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>{narration}</p>
          </CardContent>
        </Card>
      )}

      <div className={styles.section} style={{ '--stagger-index': 1 } as React.CSSProperties}>
        <AnalyticsKpiStrip items={items} />
      </div>

      <Card className={styles.section} style={{ '--stagger-index': 2 } as React.CSSProperties}>
        <CardHeader>
          <CardTitle className="font-normal">Daily sign-ins</CardTitle>
          <CardDescription>this month, company-wide</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ChartContainer config={trendConfig} className="aspect-auto h-56 w-full">
              <AreaChart data={chartData} margin={{ top: 4 }}>
                <defs>
                  <linearGradient id="fillSignIns" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-signIns)" stopOpacity={0.36} />
                    <stop offset="95%" stopColor="var(--color-signIns)" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeOpacity={0.5} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent className="w-36" />} />
                <Area dataKey="signIns" type="natural" fill="url(#fillSignIns)" stroke="var(--color-signIns)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No sign-ins recorded yet this month.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
