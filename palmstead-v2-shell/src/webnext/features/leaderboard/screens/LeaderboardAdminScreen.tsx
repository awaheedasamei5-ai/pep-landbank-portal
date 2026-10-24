'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lightbulb, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PageHeader } from '@/components/page-header';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig, useUpdateConfig } from '../../manager/hooks/useConfigSettings';
import { useLeaderboardRawRows, useLeaderboardScoreHistory, useLeaderboardSpikeAlert } from '../hooks/useLeaderboardAdmin';
import { agentPoints, isScoreSpike } from '../../manager/lib/leaderboardLogic';
import type { LeaderboardScoreHistoryEntry, LeaderboardWeights } from '../../../types/domain';
import styles from './LeaderboardAdminScreen.module.css';

interface WeightFieldDef {
  key: keyof LeaderboardWeights;
  label: string;
  hint: string;
}

const GROUPS: { title: string; fields: WeightFieldDef[] }[] = [
  {
    title: 'Sales performance',
    fields: [
      { key: 'collected', label: 'Per GHS collected', hint: 'Deliberately the biggest single factor — money actually received.' },
      { key: 'dealsClosed', label: 'Per deal closed', hint: 'A lead fully paid off within the selected year.' },
    ],
  },
  {
    title: 'Activity & tasks',
    fields: [
      { key: 'siteVisits', label: 'Per site visit', hint: 'Counts a dedicated site-visit record, falling back to a lead flagged "visited" if none exists.' },
      { key: 'tasksCompleted', label: 'Per task done', hint: 'Ops Tracker tasks marked done in range.' },
      { key: 'todosCompleted', label: 'Per to-do done', hint: 'Ops Tracker to-dos marked done in range.' },
      { key: 'taskSpeedBonus', label: 'Task speed bonus (max)', hint: 'Full bonus for same-day turnaround, tapering to zero at 10 days — zero entirely if no tasks were completed.' },
    ],
  },
  {
    title: 'Attendance',
    fields: [
      { key: 'regularity', label: 'Per day attended', hint: 'Any signed-in day in range.' },
      { key: 'punctuality', label: 'Per on-time day', hint: 'Signed in at or before the configured attendance cutoff.' },
    ],
  },
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// docs/plans/24-leaderboard-plan.md -- real destination for v1's
// weight-tuning flow, built properly as its own workspace (replacing
// the old flat form buried in general Settings) per Phase 2/3 of
// project-leaderboard-v3-audit-and-plan. Manager-only, same redirect
// pattern as the parent Leaderboard screen.
export function LeaderboardAdminScreen() {
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const update = useUpdateConfig();
  const year = new Date().getFullYear();
  const { data: rawRows } = useLeaderboardRawRows(year);
  const { data: history, isLoading: historyLoading } = useLeaderboardScoreHistory(25);

  const [weights, setWeights] = useState<LeaderboardWeights | null>(null);
  const active = weights ?? config?.leaderboardWeights ?? null;
  const dirty = !!config && !!weights && JSON.stringify(weights) !== JSON.stringify(config.leaderboardWeights);
  const [saved, setSaved] = useState(false);

  const liveRanked = useMemo(() => {
    if (!config) return [];
    return [...(rawRows ?? [])].map((r) => ({ ...r, points: agentPoints(r, config.leaderboardWeights) })).sort((a, b) => b.points - a.points);
  }, [rawRows, config]);

  const previewRanked = useMemo(() => {
    if (!active) return [];
    return [...(rawRows ?? [])].map((r) => ({ ...r, points: agentPoints(r, active) })).sort((a, b) => b.points - a.points);
  }, [rawRows, active]);

  const liveRankByKey = new Map(liveRanked.map((r, i) => [r.staffKey, i]));

  function setField(key: keyof LeaderboardWeights, value: number) {
    setWeights((w) => ({ ...(w ?? config?.leaderboardWeights ?? ({} as LeaderboardWeights)), [key]: value }));
  }

  async function save() {
    if (!weights) return;
    await update.mutateAsync({ leaderboardWeights: weights });
    setWeights(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (profile?.role !== 'manager') {
    return (
      <div>
        <PageHeader title="Leaderboard scoring" description="Tune how points are calculated." />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Lightbulb className="size-8 text-muted-foreground" />
            <p className="font-medium">See My Portfolio instead</p>
            <p className="max-w-sm text-sm text-muted-foreground">Scoring administration is a Management view. Your own rank and points live in My Portfolio.</p>
            <Link href="/dashboard/my-portfolio" className="mt-2 text-sm font-medium text-primary hover:underline">
              Go to My Portfolio
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!config || !active) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <Link href="/dashboard/leaderboard" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Leaderboard
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Leaderboard scoring" description="Tune how much each metric contributes to points. Changes preview instantly below before you save." />
        <Button type="button" disabled={!dirty || update.isPending} onClick={save}>
          {update.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {GROUPS.map((group, gi) => (
            <Card key={group.title} className={styles.section} style={{ '--stagger-index': gi } as React.CSSProperties}>
              <CardHeader>
                <CardTitle className="font-normal">{group.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`lbw-${f.key}`}>{f.label}</Label>
                      <Input id={`lbw-${f.key}`} type="number" step="any" className="w-28" value={active[f.key]} onChange={(e) => setField(f.key, Number(e.target.value))} />
                    </div>
                    <p className="text-xs text-muted-foreground">{f.hint}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card className={styles.section} style={{ '--stagger-index': 3 } as React.CSSProperties}>
            <CardHeader>
              <CardTitle className="font-normal">
                {dirty ? 'What-if preview' : 'Current standings'} <span className="font-normal text-muted-foreground">{year}</span>
              </CardTitle>
              <CardDescription>{dirty ? 'How the board would reorder with these weights, before saving.' : 'Adjust a weight on the left to preview a reorder here.'}</CardDescription>
            </CardHeader>
            <CardContent>
              {previewRanked.map((r, i) => {
                const liveRank = liveRankByKey.get(r.staffKey) ?? i;
                const moved = dirty ? liveRank - i : 0;
                return (
                  <div key={r.staffKey} className={styles.previewRow}>
                    <span className="w-5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">{r.staffName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-sm font-medium">{r.staffName}</span>
                    {moved !== 0 && <span className={moved > 0 ? styles.moveUp : styles.moveDown}>{moved > 0 ? `▲${moved}` : `▼${Math.abs(moved)}`}</span>}
                    <span className="font-mono text-sm font-bold">{r.points}</span>
                  </div>
                );
              })}
              {!previewRanked.length && <p className="text-sm text-muted-foreground">No agents to rank yet.</p>}
            </CardContent>
          </Card>

          <Card className={styles.section} style={{ '--stagger-index': 4 } as React.CSSProperties}>
            <CardHeader>
              <CardTitle className="font-normal">Recent score changes</CardTitle>
              <CardDescription>A real audit log — one entry every time a staff member&apos;s persisted score actually changes.</CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!historyLoading && !history?.length && <p className="text-sm text-muted-foreground">No score changes recorded yet. Visiting the Leaderboard or Portfolio recomputes and logs any change.</p>}
              {(history ?? []).map((h) => (
                <HistoryRow key={h.id} entry={h} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Split out so useLeaderboardSpikeAlert() -- only fetched for rows the
// deterministic isScoreSpike() already flagged -- can be called per-row
// without a conditional hook call inside the parent's own render.
function HistoryRow({ entry }: { entry: LeaderboardScoreHistoryEntry }) {
  const delta = entry.newPoints - entry.oldPoints;
  const spike = isScoreSpike(entry);
  const { data: alertText } = useLeaderboardSpikeAlert(spike ? entry : null);

  return (
    <div className={styles.historyRow}>
      <div className="flex items-center gap-3">
        <Avatar className="size-6.5">
          <AvatarFallback className="text-xs">{entry.staffName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {entry.staffName}
            {spike && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <TriangleAlert className="size-3" />
                Review
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {entry.oldPoints} → {entry.newPoints} pts · {timeAgo(entry.changedAt)}
          </div>
        </div>
        <span className={`font-mono text-sm font-bold ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
          {delta >= 0 ? '+' : ''}
          {delta}
        </span>
      </div>
      {spike && alertText && <p className={styles.spikeAlert}>{alertText}</p>}
    </div>
  );
}
