'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, Settings2, Trophy, Lightbulb } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/page-header';
import { useSessionStore } from '../../../auth/useSessionStore';
import { ghs } from '../../../shared/lib/format';
import { useLeaderboard } from '../hooks/useLeaderboard';
import styles from './LeaderboardScreen.module.css';

const MEDALS = ['🥇', '🥈', '🥉'];
const RANK_TIER_CLASS = [styles.rankFirst, styles.rankSecond, styles.rankThird];

function rank(i: number): string {
  return MEDALS[i] ?? String(i + 1);
}

function exportCsv(rows: { staffName: string; points: number; totalCollected: number; dealsClosedYear: number; siteVisits: number; tasksCompleted: number; todosCompleted: number; daysAttended: number; onTimeDays: number }[], year: number) {
  const headers = ['Rank', 'Agent', 'Points', 'Total Collected', 'Deals Closed', 'Site Visits', 'Tasks Done', 'To-Dos Done', 'Days Attended', 'On-Time Days'];
  const dataRows = rows.map((r, i) => [String(i + 1), r.staffName, String(r.points), String(r.totalCollected), String(r.dealsClosedYear), String(r.siteVisits), String(r.tasksCompleted), String(r.todosCompleted), String(r.daysAttended), String(r.onTimeDays)]);
  const csv = [headers, ...dataRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leaderboard-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// docs/plans/24-leaderboard-plan.md -- real destination for v1's
// mgrLeaderboard() (index.html:20198-20283), ported from web-next's
// already-correct useLeaderboard() hook. Manager-only (index.html:9154
// confirms the full ranked list is a manager tile); staff's real window
// into the same scoring is their own rank, already live at My Portfolio.
export function LeaderboardScreen() {
  const profile = useSessionStore((s) => s.profile);
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: rows, isLoading } = useLeaderboard(year);
  const yearOptions = [year, year - 1, year - 2];

  if (profile?.role !== 'manager') {
    return (
      <div>
        <PageHeader title="Leaderboard" description="See how every agent is ranking this month." />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Lightbulb className="size-8 text-muted-foreground" />
            <p className="font-medium">See My Portfolio instead</p>
            <p className="max-w-sm text-sm text-muted-foreground">The full team leaderboard is a Management view. Your own rank, points, and gap to the agent above you live in My Portfolio.</p>
            <Link href="/dashboard/my-portfolio" className="mt-2 text-sm font-medium text-primary hover:underline">
              Go to My Portfolio
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const leader = rows?.[0];
  const second = rows?.[1];
  const gap = leader && second ? leader.points - second.points : 0;
  const catchUpPct = leader && second && leader.points > 0 ? Math.min(100, Math.round((second.points / leader.points) * 100)) : 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Leaderboard" description="Ranked by points — money collected counts most, then deals closed, site visits, task/to-do throughput, and attendance." />
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" disabled={!rows?.length} onClick={() => rows && exportCsv(rows, year)}>
            <Download />
            Export CSV
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/leaderboard/admin">
              <Settings2 />
              Manage scoring
            </Link>
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows && rows.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No data yet.</p>}

      {leader && (
        <Card className={`${styles.section} ${styles.leaderCard} mb-4`} style={{ '--stagger-index': 0 } as React.CSSProperties}>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar className="size-12">
                <AvatarFallback className="text-lg font-bold">{leader.staffName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="min-w-[200px] flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-amber-700 uppercase dark:text-amber-400">
                  <Trophy className="size-3.5" />
                  Currently leading
                </div>
                <div className="mt-0.5 text-xl font-extrabold">{leader.staffName}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {ghs(leader.totalCollected)} collected · {leader.dealsClosedYear} deal{leader.dealsClosedYear === 1 ? '' : 's'} closed {year} · {leader.siteVisits} site visit{leader.siteVisits === 1 ? '' : 's'}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-3xl font-extrabold">{leader.points}</div>
                <div className="text-xs tracking-wide text-muted-foreground uppercase">points</div>
              </div>
            </div>
            {second && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{second.staffName} is catching up</span>
                  <span>
                    {gap} point{gap === 1 ? '' : 's'} behind
                  </span>
                </div>
                <div className={styles.catchUpTrack}>
                  <div className={styles.catchUpFill} style={{ width: `${catchUpPct}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <Card key={r.staffKey} className={styles.section} style={{ '--stagger-index': i + 1 } as React.CSSProperties}>
              <CardContent className="flex items-center gap-3 py-3">
                <div className={`${styles.rankBadge} ${RANK_TIER_CLASS[i] ?? ''}`}>{rank(i)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{r.staffName}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{ghs(r.totalCollected)} collected</Badge>
                    <Badge variant="outline">{r.dealsClosedYear} deals</Badge>
                    <Badge variant="outline">{r.siteVisits} visits</Badge>
                    <Badge variant="outline">{r.tasksCompleted} tasks</Badge>
                    <Badge variant="outline">{r.todosCompleted} to-dos</Badge>
                    <Badge variant="outline">
                      {r.daysAttended} days ({r.onTimeDays} on time)
                    </Badge>
                  </div>
                </div>
                <div className="font-mono text-lg font-bold">{r.points}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
