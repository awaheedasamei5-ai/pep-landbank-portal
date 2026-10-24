'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AnalyticsKpiStrip, type KpiStripItem } from './AnalyticsKpiStrip';
import { useSalesActivityAnalytics } from '../hooks/useSalesActivityAnalytics';
import { useAnalyticsTabNarration } from '../hooks/useAnalyticsTabNarration';
import styles from './AnalyticsScreen.module.css';

const trendConfig = {
  quotations: { label: 'Quotations', color: 'var(--chart-1)' },
  contracts: { label: 'Contracts', color: 'var(--chart-2)' },
  referrals: { label: 'Referrals', color: 'var(--chart-3)' },
} satisfies ChartConfig;

// docs/plans/27-analytics-v2-cross-app-plan.md -- real cross-app Sales
// Activity tab: Quotation, Contract of Sale, Referrals, Complaints,
// Site Visits, none of which the original Analytics (Sales/Finance
// only) covered.
export function SalesActivityTab() {
  const { isLoading, metrics, monthLabels, thisMonthLabel } = useSalesActivityAnalytics();

  const context = !isLoading
    ? {
        quotations: metrics.quotations,
        contracts: metrics.contracts,
        referrals: metrics.referrals,
        complaints: metrics.complaints,
        siteVisits: metrics.siteVisits,
      }
    : null;
  const { data: narration } = useAnalyticsTabNarration('analytics_sales_activity_summary', context);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const items: KpiStripItem[] = [
    { key: 'quotations', label: 'Quotations sent', value: String(metrics.quotations.current), deltaPct: metrics.quotations.deltaPct, fromLabel: String(metrics.quotations.previous), periodLabel: thisMonthLabel },
    { key: 'contracts', label: 'Contracts generated', value: String(metrics.contracts.current), deltaPct: metrics.contracts.deltaPct, fromLabel: String(metrics.contracts.previous), periodLabel: thisMonthLabel },
    { key: 'referrals', label: 'Referrals logged', value: String(metrics.referrals.current), deltaPct: metrics.referrals.deltaPct, fromLabel: String(metrics.referrals.previous), periodLabel: thisMonthLabel },
    { key: 'complaints', label: 'Complaints opened', value: String(metrics.complaints.current), deltaPct: metrics.complaints.deltaPct, fromLabel: String(metrics.complaints.previous), periodLabel: thisMonthLabel },
    { key: 'siteVisits', label: 'Site visits', value: String(metrics.siteVisits.current), deltaPct: metrics.siteVisits.deltaPct, fromLabel: String(metrics.siteVisits.previous), periodLabel: thisMonthLabel },
  ];

  const chartData = monthLabels.map((label, i) => ({
    month: label,
    quotations: metrics.quotations.trend[i] ?? 0,
    contracts: metrics.contracts.trend[i] ?? 0,
    referrals: metrics.referrals.trend[i] ?? 0,
  }));

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
          <CardTitle className="font-normal">Quotations, contracts &amp; referrals</CardTitle>
          <CardDescription>last 6 months</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.5} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent className="w-44" />} />
              <Line dataKey="quotations" type="monotone" stroke="var(--color-quotations)" strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="contracts" type="monotone" stroke="var(--color-contracts)" strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="referrals" type="monotone" stroke="var(--color-referrals)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
