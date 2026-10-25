'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, Settings2, Lightbulb, Medal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/page-header';
import { useSessionStore } from '../../../auth/useSessionStore';
import { ghs } from '../../../shared/lib/format';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useLeaderboardScoreHistory } from '../hooks/useLeaderboardAdmin';
import { LeaderboardPodium } from './LeaderboardPodium';
import { TierStrip } from './TierStrip';
import { PointsTrendChart } from './PointsTrendChart';
import type { LeaderboardRow } from '../../../types/domain';
import styles from './LeaderboardScreen.module.css';

const RANK_TIER_CLASS = [styles.rankFirst, styles.rankSecond, styles.rankThird];

function rank(i: number): ReactNode {
  return i < 3 ? <Medal className="size-4" aria-hidden="true" /> : String(i + 1);
}

function exportCsv(rows: LeaderboardRow[], year: number) {
  const headers = ['Rank', 'Agent', 'Points', 'Total Collected', 'Deals Closed', 'Site Visits', 'Tasks Done', 'To-Dos Done', 'Days Attended', 'On-Time Days', 'Quotations Sent', 'Contracts Generated', 'Referrals Converted'];
  const dataRows = rows.map((r, i) => [
    String(i + 1),
    r.staffName,
    String(r.points),
    String(r.totalCollected),
    String(r.dealsClosedYear),
    String(r.siteVisits),
    String(r.tasksCompleted),
    String(r.todosCompleted),
    String(r.daysAttended),
    String(r.onTimeDays),
    String(r.quotationsSent),
    String(r.contractsGenerated),
    String(r.referralsConverted),
  ]);
  const csv = [headers, ...dataRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leaderboard-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// docs/plans/25-leaderboard-v2-cross-app-plan.md -- real podium + tier
// bands + points-trend chart + full ranked list, scoring now connected
// to Quotation, Contract of Sale and Referrals (on top of the original
// Sales/Attendance/Operations Tracker inputs). Manager-only
// (index.html:9154 confirms the full ranked list is a manager tile);
// staff's real window into the same scoring is their own rank, already
// live at My Portfolio.
export function LeaderboardScreen() {
  const profile = useSessionStore((s) => s.profile);
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: rows, isLoading } = useLeaderboard(year);
  const { data: history } = useLeaderboardScoreHistory(100);
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="Leaderboard"
          description="Ranked by points — money collected, deals closed, site visits, task/to-do throughput, attendance, quotations sent, contracts generated, and referrals converted."
        />
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

      {rows && rows.length > 0 && (
        <>
          <Card className={`${styles.section} mb-4`} style={{ '--stagger-index': 0 } as React.CSSProperties}>
            <CardContent className="pt-4">
              <LeaderboardPodium rows={rows} />
              <TierStrip rows={rows} />
            </CardContent>
          </Card>

          <Card className={`${styles.section} mb-4`} style={{ '--stagger-index': 1 } as React.CSSProperties}>
            <CardHeader>
              <CardTitle className="font-normal">Points over time</CardTitle>
              <CardDescription>A real trend from the score-change audit log — grows as more changes are recorded.</CardDescription>
            </CardHeader>
            <CardContent>
              <PointsTrendChart history={history ?? []} />
            </CardContent>
          </Card>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <Card key={r.staffKey} className={styles.section} style={{ '--stagger-index': i + 2 } as React.CSSProperties}>
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
                      <Badge variant="outline">{r.quotationsSent} quotations</Badge>
                      <Badge variant="outline">{r.contractsGenerated} contracts</Badge>
                      <Badge variant="outline">{r.referralsConverted} referrals</Badge>
                    </div>
                  </div>
                  <div className="font-mono text-lg font-bold">{r.points}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
