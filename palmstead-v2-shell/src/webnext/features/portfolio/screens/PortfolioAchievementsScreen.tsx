'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/page-header';
import { useSessionStore } from '../../../auth/useSessionStore';
import { usePortfolio } from '../hooks/usePortfolio';
import { AchievementUnlockModal } from './AchievementUnlockModal';
import type { AchievementDef, StaffAchievement } from '../../../types/domain';
import styles from './PortfolioAchievementsScreen.module.css';
import { cn } from 'cn';

// docs/plans/21-my-portfolio-plan.md -- the full trophy cabinet, drilled
// into from the overview's summary strip (mirrors Smart Insights'
// overview + drill-down precedent). Port of v1's paintAchievementGrid()
// (index.html:16829-16874): earned badges shown solid with the date,
// locked ones shown muted with a progress bar toward the threshold, so
// there's always something visible to work toward.
export function PortfolioAchievementsScreen() {
  const profile = useSessionStore((s) => s.profile);
  const portfolio = usePortfolio();
  const [cabinetOnly, setCabinetOnly] = useState(false);

  if (profile?.role === 'manager') {
    return (
      <div>
        <PageHeader title="Achievements" description="Portfolio is for individual staff tracking." />
      </div>
    );
  }

  const earnedByDefId = new Map(portfolio.earned.map((e) => [e.achievementId, e]));
  const wonDefs = portfolio.defs.filter((d) => earnedByDefId.has(d.id));
  const totalPoints = wonDefs.reduce((s, d) => s + d.points, 0);
  const shown = cabinetOnly ? wonDefs : portfolio.defs;
  const unlocked = portfolio.unlockQueue[0] ?? null;

  return (
    <div>
      <Link href="/dashboard/my-portfolio" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Back to Portfolio
      </Link>
      <PageHeader title="Achievements" description="Earned automatically as you hit each milestone." />

      {portfolio.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : portfolio.defs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Management hasn&apos;t set any up yet — check back soon.</CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-4 bg-gradient-to-br from-amber-50 to-muted/30 dark:from-amber-950/20 dark:to-muted/10">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <div>
                <div className="text-lg font-extrabold">
                  <Trophy className="inline size-5" aria-hidden="true" /> {wonDefs.length} of {portfolio.defs.length} earned
                </div>
                <div className="text-xs text-muted-foreground">{totalPoints} points from achievements</div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setCabinetOnly((v) => !v)}>
                {cabinetOnly ? 'Show all' : 'Show my cabinet'}
              </Button>
            </CardContent>
          </Card>

          {shown.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">Nothing earned yet — keep going, your first trophy is closer than you think.</CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {shown.map((def, i) => (
                <AchievementTile key={def.id} def={def} earned={earnedByDefId.get(def.id) ?? null} index={i} />
              ))}
            </div>
          )}
        </>
      )}

      <AchievementUnlockModal def={unlocked} onClose={portfolio.dismissUnlock} />
    </div>
  );
}

function AchievementTile({ def, earned, index }: { def: AchievementDef; earned: StaffAchievement | null; index: number }) {
  const threshold = def.criteriaConfig?.threshold ?? 1;
  const progressValue = earned?.progress?.value ?? 0;
  const pct = earned ? 100 : Math.max(0, Math.min(100, Math.round((progressValue / threshold) * 100)));

  return (
    <Card className={cn(styles.tile, earned ? 'border-amber-500/40' : 'opacity-90')} style={{ '--stagger-index': index } as React.CSSProperties}>
      <CardContent className="flex flex-col items-center gap-1.5 pt-6 text-center">
        <div
          className="text-3xl"
          style={!earned ? { opacity: Math.max(0.25, pct / 100), filter: `grayscale(${100 - pct}%)` } : undefined}
        >
          {def.icon || '🏅'}
        </div>
        <div className="text-sm font-semibold leading-snug">{def.label}</div>
        {earned ? (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Earned {earned.earnedAt.slice(0, 10)}</span>
            {def.points > 0 && <span className="font-semibold text-amber-600 dark:text-amber-400">+{def.points} pts</span>}
          </div>
        ) : (
          <div className="mt-1 w-full">
            <Progress value={pct} className={styles.progressBar} />
            <div className="mt-1 text-xs text-muted-foreground">
              {progressValue}/{threshold}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
