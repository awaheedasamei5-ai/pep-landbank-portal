'use client';

import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { Label, Pie, PieChart } from 'recharts';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { ghs } from '../../../shared/lib/format';
import { useAnalyticsOverview } from '../hooks/useAnalyticsOverview';
import { useManagerDailyBriefing } from '../hooks/useManagerDailyBriefing';
import styles from './AnalyticsScreen.module.css';

const METHOD_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function trailingMonthLabels(): string[] {
  const d = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(d.getFullYear(), d.getMonth() - (5 - i), 1);
    return dt.toLocaleDateString('en-GB', { month: 'short' });
  });
}

const trendConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-1)' },
} satisfies ChartConfig;

// docs/plans/23-analytics-plan.md / docs/plans/27-analytics-v2-cross-
// app-plan.md -- the original Overview content, unchanged, now living
// in its own tab alongside 3 new cross-app domains.
export function OverviewTab() {
  const a = useAnalyticsOverview();
  const monthLabels = trailingMonthLabels();
  const trendData = monthLabels.map((label, i) => ({ month: label, revenue: a.revenueTrend[i] ?? 0 }));

  const { data: briefing } = useManagerDailyBriefing(
    !a.isLoading
      ? {
          totalLeads: a.totalLeads,
          outstanding: a.outstanding,
          fullyPaidCount: a.fullyPaidCount,
          openComplaints: a.openComplaints,
          pipelineValue: a.pipelineValue,
          siteVisitsCount: a.siteVisitsCount,
          collectedThisMonth: a.revenueThisMonth,
          collectedTrend: a.revenueTrend,
          stageFunnel: a.stageFunnel,
          byAgent: a.byAgent.slice(0, 5).map((r) => ({ name: r.name, value: r.value })),
        }
      : null,
  );

  if (a.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const composition = a.composition;
  const compSegments = composition
    ? [
        { key: 'committed', label: 'Committed (paying)', value: composition.committedVal, color: 'var(--color-success, #16a34a)' },
        { key: 'prospect', label: 'Prospects (unpaid)', value: composition.prospectVal, color: '#94A3B8' },
      ]
    : [];

  return (
    <div className="space-y-4">
      {briefing && (
        <Card className={`${styles.section} ${styles.briefingCard}`} style={{ '--stagger-index': 0 } as React.CSSProperties}>
          <CardContent className="flex items-start gap-2 pt-6 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>{briefing}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={styles.section} style={{ '--stagger-index': 1 } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardDescription>Revenue this month</CardDescription>
            <CardTitle className="text-2xl">{ghs(a.revenueThisMonth)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={styles.section} style={{ '--stagger-index': 2 } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding</CardDescription>
            <CardTitle className="text-2xl text-amber-600 dark:text-amber-400">{ghs(a.outstanding)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={styles.section} style={{ '--stagger-index': 3 } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardDescription>Fully paid</CardDescription>
            <CardTitle className="text-2xl">{a.fullyPaidCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={styles.section} style={{ '--stagger-index': 4 } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardDescription>Net position</CardDescription>
            <CardTitle className={`text-2xl ${a.netPosition && a.netPosition.net < 0 ? 'text-destructive' : ''}`}>{a.netPosition ? ghs(a.netPosition.net) : '—'}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className={styles.section} style={{ '--stagger-index': 5 } as React.CSSProperties}>
        <CardHeader>
          <CardTitle className="font-normal">Revenue trend</CardTitle>
          <CardDescription>last 6 months, all agents</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
            <AreaChart data={trendData} margin={{ top: 0 }}>
              <defs>
                <linearGradient id="fillAnalyticsRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.36} />
                  <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeOpacity={0.5} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent className="w-40" indicator="line" formatter={(value) => ghs(value as number)} />} />
              <Area dataKey="revenue" type="natural" fill="url(#fillAnalyticsRevenue)" stroke="var(--color-revenue)" strokeWidth={1.5} dot={false} fillOpacity={1} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={styles.section} style={{ '--stagger-index': 6 } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="font-normal">Pipeline composition</CardTitle>
            <CardDescription>{composition ? `${composition.activeCount} active leads · ${ghs(composition.totalVal)}` : '—'}</CardDescription>
          </CardHeader>
          <CardContent>
            {composition && composition.totalVal > 0 ? (
              <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
                <ChartContainer config={{}} className="mx-auto aspect-square h-40">
                  <PieChart>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel className="w-52" nameKey="label" />} />
                    <Pie data={compSegments} dataKey="value" nameKey="label" innerRadius={48} outerRadius={68} paddingAngle={2} cornerRadius={4} strokeWidth={4}>
                      <Label
                        content={({ viewBox }) => {
                          if (!(viewBox && 'cx' in viewBox && 'cy' in viewBox)) return null;
                          return (
                            <text dominantBaseline="middle" textAnchor="middle" x={viewBox.cx} y={viewBox.cy}>
                              <tspan className="fill-muted-foreground text-xs" x={viewBox.cx} y={(viewBox.cy ?? 0) - 6}>
                                Health
                              </tspan>
                              <tspan className="fill-foreground font-medium text-[11px]" x={viewBox.cx} y={(viewBox.cy ?? 0) + 10}>
                                {composition.healthLabel.split(' — ')[0]}
                              </tspan>
                            </text>
                          );
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex min-w-0 flex-col">
                  {compSegments.map((s) => (
                    <div key={s.key} className={styles.legendRow}>
                      <span className={styles.legendDot} style={{ backgroundColor: s.color }} />
                      <span className={styles.legendLabel}>{s.label}</span>
                      <span className={styles.legendValue}>{s.key === 'committed' ? composition.committedPct : composition.prospectPct}%</span>
                    </div>
                  ))}
                  <p className="mt-2 text-xs text-muted-foreground">{composition.healthLabel}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active pipeline yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className={styles.section} style={{ '--stagger-index': 7 } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="font-normal">Payments by method</CardTitle>
            <CardDescription>{a.monthLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {a.methodBreakdown.length > 0 ? (
              <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
                <ChartContainer config={{}} className="mx-auto aspect-square h-40">
                  <PieChart>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel className="w-52" nameKey="method" />} />
                    <Pie
                      data={a.methodBreakdown.map((m, i) => ({ ...m, fill: METHOD_COLORS[i % METHOD_COLORS.length] }))}
                      dataKey="total"
                      nameKey="method"
                      innerRadius={48}
                      outerRadius={68}
                      paddingAngle={2}
                      cornerRadius={4}
                      strokeWidth={4}
                    />
                  </PieChart>
                </ChartContainer>
                <div className="flex min-w-0 flex-col">
                  {a.methodBreakdown.map((m, i) => (
                    <div key={m.method} className={styles.legendRow}>
                      <span className={styles.legendDot} style={{ backgroundColor: METHOD_COLORS[i % METHOD_COLORS.length] }} />
                      <span className={styles.legendLabel}>{m.method}</span>
                      <span className={styles.legendValue}>{ghs(m.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No payments recorded yet this month.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className={styles.section} style={{ '--stagger-index': 8 } as React.CSSProperties}>
        <CardHeader>
          <CardTitle className="font-normal">Top agents</CardTitle>
          <CardDescription>by revenue collected, {a.monthLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {a.topAgents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agent activity this month.</p>
          ) : (
            a.topAgents.map((agent, i) => (
              <div key={agent.key} className={styles.agentRow}>
                <div className="flex items-center gap-3">
                  <span className={styles.rankBadge}>{i + 1}</span>
                  <div>
                    <div className="text-sm font-semibold">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {agent.newLeads} new lead{agent.newLeads === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <div className="font-mono text-sm font-bold">{ghs(agent.revenue)}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {a.netPosition && (
        <Card className={styles.section} style={{ '--stagger-index': 9 } as React.CSSProperties}>
          <CardHeader>
            <CardTitle className="font-normal">Net position</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`font-mono text-2xl font-extrabold ${a.netPosition.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{ghs(a.netPosition.net)}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Cash-basis this month: {ghs(a.netPosition.revenue)} in payments minus {ghs(a.netPosition.expensesOut)} in approved expenses. Does not include commission payouts, which aren&apos;t
              logged as a cash outflow yet.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Need a downloadable PDF or Excel export instead?{' '}
        <Link href="/dashboard/finance?tab=reports" className="font-medium text-primary hover:underline">
          Go to Reports <ArrowRight className="inline size-3" aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}
