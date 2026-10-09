"use client";

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function ComparisonRow({ label, you, team }: { label: string; you: number; team: number }) {
  const max = Math.max(you, team, 1);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-right text-xs font-medium">{you}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(you / max) * 100}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-right text-xs font-medium text-muted-foreground">{team}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${(team / max) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

// Rebuilt on the shell's real Card/Badge after the 2026-10-08/09
// correction -- same progress-bar pattern as LeaveBalanceCard, applied
// here to a you-vs-team comparison instead of a quota.
export function AttendanceComparison({
  you,
  rank,
  teamCount,
  teamAvgOnTime,
  teamAvgAttended,
}: {
  you: { daysAttended: number; onTimeDays: number } | null;
  rank: number | null;
  teamCount: number;
  teamAvgOnTime: number;
  teamAvgAttended: number;
}) {
  if (!teamCount) return null;
  const yourOnTime = you?.onTimeDays ?? 0;
  const yourAttended = you?.daysAttended ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>You vs the team</CardTitle>
          {rank && <Badge variant="outline">Rank #{rank} of {teamCount}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ComparisonRow label="On-time days" you={yourOnTime} team={teamAvgOnTime} />
        <ComparisonRow label="Days attended" you={yourAttended} team={teamAvgAttended} />
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2 rounded-full bg-primary" /> You
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2 rounded-full bg-muted-foreground/40" /> Team average
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
