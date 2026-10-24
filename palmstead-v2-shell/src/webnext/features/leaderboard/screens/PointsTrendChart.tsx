'use client';

import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { LeaderboardScoreHistoryEntry } from '../../../types/domain';

const LINE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

// docs/plans/25-leaderboard-v2-cross-app-plan.md -- real trend, built
// from the already-live `leaderboard_score_history` audit table (never
// synthetic/mocked data), one line per staff member who has at least 2
// recorded changes. Reuses the same ChartContainer/ChartTooltip
// wrapper this app's own Home dashboard and Analytics screen already
// use for their real recharts charts.
export function PointsTrendChart({ history }: { history: LeaderboardScoreHistoryEntry[] }) {
  const { series, config, points } = useMemo(() => {
    const byStaff = new Map<string, { changedAt: string; points: number }[]>();
    [...history]
      .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
      .forEach((h) => {
        const arr = byStaff.get(h.staffName) ?? [];
        if (arr.length === 0) arr.push({ changedAt: h.changedAt, points: h.oldPoints });
        arr.push({ changedAt: h.changedAt, points: h.newPoints });
        byStaff.set(h.staffName, arr);
      });
      const eligible = [...byStaff.entries()].filter(([, pts]) => pts.length >= 2);
    const allTimes = [...new Set(eligible.flatMap(([, pts]) => pts.map((p) => p.changedAt)))].sort();
    const merged = allTimes.map((t) => {
      const row: Record<string, string | number> = { t: new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) };
      eligible.forEach(([name, pts]) => {
        const upToNow = pts.filter((p) => p.changedAt <= t);
        if (upToNow.length) row[name] = upToNow[upToNow.length - 1].points;
      });
      return row;
    });
    const cfg: ChartConfig = {};
    eligible.forEach(([name], i) => {
      cfg[name] = { label: name, color: LINE_COLORS[i % LINE_COLORS.length] };
    });
    return { series: eligible, config: cfg, points: merged };
  }, [history]);

  if (series.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough score history yet — a trend line appears once an agent's score has changed at least twice.</p>;
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={32} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent className="w-44" />} />
        {series.map(([name], i) => (
          <Line key={name} dataKey={name} type="monotone" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
