"use client";

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DonutRing } from '../../banners/components/BannerCharts';

// Reuses the same real DonutRing primitive the Banner Health hero panel
// uses (banners/components/BannerCharts.tsx) -- this app's own
// on-time-rate gauge, not a new chart component. Rebuilt on the shell's
// real Card/Badge after the 2026-10-08/09 correction.
export function AttendanceMonthCard({
  monthLabel,
  stats,
}: {
  monthLabel: string;
  stats: { workdaysSoFar: number; daysAttended: number; onTimeDays: number; lateDays: number; absences: number; leaveDaysCount: number; attendanceRate: number; onTimeRate: number; onTrack: boolean };
}) {
  const tiles: { value: number | string; label: string; warn?: boolean }[] = [
    { value: `${stats.attendanceRate}%`, label: 'Attendance rate' },
    { value: stats.daysAttended, label: 'Days attended' },
    { value: stats.lateDays, label: 'Late days' },
    { value: stats.absences, label: 'Absences', warn: stats.absences > 0 },
    { value: stats.leaveDaysCount, label: 'On leave' },
    { value: stats.workdaysSoFar, label: 'Workdays so far' },
  ];

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="relative flex items-center justify-center">
            <DonutRing pct={stats.onTimeRate} size={92} stroke={10} />
            <div className="absolute flex flex-col items-center">
              <strong className="font-heading text-xl font-semibold">{stats.onTimeRate}%</strong>
              <span className="text-xs text-muted-foreground">on time</span>
            </div>
          </div>
          <div className="text-sm font-medium">{monthLabel}</div>
          <Badge variant={stats.onTrack ? 'default' : 'destructive'}>{stats.onTrack ? 'On track' : 'At risk'}</Badge>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="text-center sm:text-left">
              <div className={`font-heading text-2xl font-semibold ${t.warn ? 'text-destructive' : ''}`}>{t.value}</div>
              <div className="text-xs text-muted-foreground">{t.label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
