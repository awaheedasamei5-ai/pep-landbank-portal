import type { LeaderboardRow } from '../../../types/domain';
import styles from './TierStrip.module.css';

// docs/plans/25-leaderboard-v2-cross-app-plan.md -- real tier/league
// bands, the information-architecture piece borrowed conceptually from
// Trophy.so's component set (podium + tiered levels, reference only --
// not an installable repo). Quartile-based against THIS real team's own
// point distribution rather than hardcoded thresholds, so it stays
// meaningful regardless of team size or how the scoring formula's scale
// shifts over time (e.g. after the cross-app weight changes this
// migration just shipped).
const TIERS = [
  { key: 'diamond', label: 'Diamond', color: '#5EC8D8' },
  { key: 'gold', label: 'Gold', color: '#D4A72C' },
  { key: 'silver', label: 'Silver', color: '#9AA5B1' },
  { key: 'bronze', label: 'Bronze', color: '#B87333' },
] as const;

export function tierForRank(rank: number, total: number): (typeof TIERS)[number] {
  if (total <= 1) return TIERS[0];
  const pct = rank / total;
  if (pct <= 0.25) return TIERS[0];
  if (pct <= 0.5) return TIERS[1];
  if (pct <= 0.75) return TIERS[2];
  return TIERS[3];
}

export function TierStrip({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length < 2) return null;
  const counts = new Map<string, number>();
  rows.forEach((_, i) => {
    const tier = tierForRank(i + 1, rows.length);
    counts.set(tier.key, (counts.get(tier.key) ?? 0) + 1);
  });
  return (
    <div className={styles.strip}>
      {TIERS.map((t) => {
        const count = counts.get(t.key) ?? 0;
        if (!count) return null;
        return (
          <div key={t.key} className={styles.tile} style={{ '--tier-color': t.color } as React.CSSProperties}>
            <span className={styles.dot} />
            <span className={styles.label}>{t.label}</span>
            <span className={styles.count}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}
