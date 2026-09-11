import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../../../shared/ui/Avatar';
import { useConfig, useUpdateConfig } from '../hooks/useConfigSettings';
import { useLeaderboardRawRows, useLeaderboardScoreHistory, useLeaderboardSpikeAlert } from '../hooks/useLeaderboardAdmin';
import { agentPoints, isScoreSpike } from '../lib/leaderboardLogic';
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
      { key: 'collected', label: 'Per GHS collected', hint: 'Deliberately the biggest single factor -- money actually received.' },
      { key: 'dealsClosed', label: 'Per deal closed', hint: 'A lead fully paid off within the selected year.' },
    ],
  },
  {
    title: 'Activity & tasks',
    fields: [
      { key: 'siteVisits', label: 'Per site visit', hint: 'Counts a dedicated site-visit record, falling back to a lead flagged "visited" if none exists.' },
      { key: 'tasksCompleted', label: 'Per task done', hint: 'Ops Tracker tasks marked done in range.' },
      { key: 'todosCompleted', label: 'Per to-do done', hint: 'Ops Tracker to-dos marked done in range.' },
      { key: 'taskSpeedBonus', label: 'Task speed bonus (max)', hint: 'Full bonus for same-day turnaround, tapering to zero at 10 days -- zero entirely if no tasks were completed.' },
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

// Real Management scoring-admin workspace -- replaces the flat 8-field
// form that used to be buried inside general Settings (the audit behind
// project-leaderboard-v3-audit-and-plan flagged this as one of the gaps
// vs. the V3 spec's own "enable metrics, assign weights... what-if
// previews, score audits" requirement). This phase ships weight editing
// with a real live what-if preview and a real score-change audit log;
// per-metric enable/disable, caps and eligibility rules are still open,
// tracked in that same memory file as a later phase.
export function LeaderboardAdminScreen() {
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

  if (!config || !active) return <div className={styles.wrap}>Loading…</div>;

  return (
    <div className={styles.wrap}>
      <Link to="/app/mgr/leaderboard" className={styles.back}>
        ← Leaderboard
      </Link>
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Manager · Scoring administration</div>
          <h1 className={styles.title}>Leaderboard scoring</h1>
          <p className={styles.sub}>Tune how much each metric contributes to points. Changes preview instantly below before you save.</p>
        </div>
        <button type="button" className={styles.saveBtn} disabled={!dirty || update.isPending} onClick={save}>
          {update.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
        </button>
      </div>

      <div className={styles.columns}>
        <div className={styles.weightsCol}>
          {GROUPS.map((group) => (
            <div key={group.title} className={styles.card}>
              <div className={styles.cardTitle}>{group.title}</div>
              {group.fields.map((f) => (
                <div key={f.key} className={styles.field}>
                  <div className={styles.fieldHead}>
                    <label className={styles.label}>{f.label}</label>
                    <input className={styles.input} type="number" step="any" value={active[f.key]} onChange={(e) => setField(f.key, Number(e.target.value))} />
                  </div>
                  <p className={styles.fieldHint}>{f.hint}</p>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.previewCol}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              {dirty ? 'What-if preview' : 'Current standings'} <span className={styles.cardTitleYear}>{year}</span>
            </div>
            <p className={styles.cardHint}>{dirty ? 'How the board would reorder with these weights, before saving.' : 'Adjust a weight on the left to preview a reorder here.'}</p>
            <div className={styles.previewList}>
              {previewRanked.map((r, i) => {
                const liveRank = liveRankByKey.get(r.staffKey) ?? i;
                const moved = dirty ? liveRank - i : 0;
                return (
                  <div key={r.staffKey} className={styles.previewRow}>
                    <span className={styles.previewRank}>{i + 1}</span>
                    <Avatar name={r.staffName} size={28} />
                    <span className={styles.previewName}>{r.staffName}</span>
                    {moved !== 0 && <span className={moved > 0 ? styles.moveUp : styles.moveDown}>{moved > 0 ? `▲${moved}` : `▼${Math.abs(moved)}`}</span>}
                    <span className={styles.previewPoints}>{r.points}</span>
                  </div>
                );
              })}
              {!previewRanked.length && <p className={styles.hint}>No agents to rank yet.</p>}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Recent score changes</div>
            <p className={styles.cardHint}>A real audit log -- one entry every time a staff member's persisted score actually changes.</p>
            {historyLoading && <p className={styles.hint}>Loading…</p>}
            {!historyLoading && !history?.length && <p className={styles.hint}>No score changes recorded yet. Visiting the Leaderboard or Portfolio recomputes and logs any change.</p>}
            <div className={styles.historyList}>
              {(history ?? []).map((h) => {
                return <HistoryRow key={h.id} entry={h} />;
              })}
            </div>
          </div>
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
      <div className={styles.historyRowTop}>
        <Avatar name={entry.staffName} size={26} />
        <div className={styles.historyMain}>
          <div className={styles.historyName}>
            {entry.staffName}
            {spike && <span className={styles.spikeTag}>⚠ Review</span>}
          </div>
          <div className={styles.historyMeta}>
            {entry.oldPoints} → {entry.newPoints} pts &middot; {timeAgo(entry.changedAt)}
          </div>
        </div>
        <span className={delta >= 0 ? styles.deltaUp : styles.deltaDown}>
          {delta >= 0 ? '+' : ''}
          {delta}
        </span>
      </div>
      {spike && alertText && <p className={styles.spikeAlert}>{alertText}</p>}
    </div>
  );
}
