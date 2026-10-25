'use client';

import Link from 'next/link';
import { ChevronRight, Sparkles, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useSessionStore } from '../../../auth/useSessionStore';
import { usePortfolio, useLeaderboardGapCoach } from '../hooks/usePortfolio';
import { AchievementUnlockModal } from './AchievementUnlockModal';

// docs/plans/21-my-portfolio-plan.md -- real destination for v1's
// viewPortfolioApp()/paintPerformanceSection() (index.html:16812-16910).
// Agent-only (same gate v1 always used): a manager already sees
// everyone on the Leaderboard, so Portfolio redirects them to a plain
// explanation instead of a broken/empty staff screen.
export function PortfolioScreen() {
  const profile = useSessionStore((s) => s.profile);
  const portfolio = usePortfolio();
  const { data: gapCoach } = useLeaderboardGapCoach(
    portfolio.rank != null && profile
      ? { staffName: profile.name, rank: portfolio.rank, totalRanked: portfolio.totalRanked, points: portfolio.points, aboveName: portfolio.aboveName, gap: portfolio.gap, suggestions: portfolio.suggestions }
      : null,
  );

  if (profile?.role === 'manager') {
    return (
      <div>
        <PageHeader title="My Portfolio" description="Your rank, your progress, and what you've earned." />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Trophy className="size-8 text-muted-foreground" />
            <p className="font-medium">See the Leaderboard instead</p>
            <p className="max-w-sm text-sm text-muted-foreground">Portfolio is for individual staff tracking — as Management you already see everyone on the Leaderboard.</p>
            <Link href="/dashboard/leaderboard" className="mt-2 text-sm font-medium text-primary hover:underline">
              Go to Leaderboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const earnedCount = portfolio.earned.length;
  const totalCount = portfolio.defs.length;
  const totalPoints = portfolio.defs.filter((d) => portfolio.earned.some((e) => e.achievementId === d.id)).reduce((s, d) => s + d.points, 0);
  const unlocked = portfolio.unlockQueue[0] ?? null;

  return (
    <div>
      <PageHeader title="My Portfolio" description="Your rank, your progress, and what you've earned." />

      {portfolio.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!portfolio.isLoading && portfolio.rank == null && <p className="text-sm text-muted-foreground">No leaderboard data yet this year.</p>}

      {!portfolio.isLoading && portfolio.rank != null && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="font-mono text-4xl font-extrabold text-amber-600 dark:text-amber-400">#{portfolio.rank}</div>
              <div>
                <div className="text-xs text-muted-foreground">of {portfolio.totalRanked} on the team this year</div>
                <div className="text-lg font-bold">{portfolio.points} points</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              {portfolio.aboveName ? (
                <>
                  <div className="text-xs text-muted-foreground">Gap to {portfolio.aboveName}</div>
                  <div className="text-lg font-bold text-destructive">
                    {portfolio.gap} point{portfolio.gap === 1 ? '' : 's'}
                  </div>
                  {portfolio.suggestions.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                      {portfolio.suggestions.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <div className="font-medium text-emerald-600 dark:text-emerald-400">You&apos;re #1 — keep it up <Sparkles className="inline size-4" aria-hidden="true" /></div>
              )}
              {gapCoach && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground italic">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {gapCoach}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Link href="/dashboard/my-portfolio/achievements" className="mt-4 block">
        <Card className="transition-colors hover:bg-muted/40">
          <CardContent className="flex items-center justify-between gap-3 pt-6">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-lg"><Trophy className="size-5" aria-hidden="true" /></span>
              <div>
                <div className="font-semibold">
                  {earnedCount} of {totalCount} achievements earned
                </div>
                <div className="text-xs text-muted-foreground">{totalPoints} points from achievements — see the full trophy cabinet</div>
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <AchievementUnlockModal def={unlocked} onClose={portfolio.dismissUnlock} />
    </div>
  );
}
