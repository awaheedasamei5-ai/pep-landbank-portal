import { useState } from 'react';
import { ghs } from '../../../shared/lib/format';
import { useLeaderboard } from '../hooks/useLeaderboard';
import styles from './LeaderboardScreen.module.css';

const MEDALS = ['🥇', '🥈', '🥉'];
const ROW_TIER_CLASS = ['rowFirst', 'rowSecond', 'rowThird'] as const;
const RANK_TIER_CLASS = ['rankFirst', 'rankSecond', 'rankThird'] as const;

function rank(i: number): string {
  return MEDALS[i] ?? String(i + 1);
}

// Real leaderboard_rows() RPC + agentPoints() (index.html:19590-19622,
// 19767-19863), scoped to the highest-value slice for this first cut: the
// ranked list itself and the leader/runner-up catch-up banner. Out of scope
// here (index.html's much larger mgrLeaderboard()): per-agent pipeline
// health/win-rate/avg-monthly enrichment (display-only, not part of
// points -- a real follow-up, not a gap in the points themselves), CSV
// export, and the Weights config editor.
export function LeaderboardScreen() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: rows, isLoading } = useLeaderboard(year);
  const yearOptions = [year, year - 1, year - 2];

  const leader = rows?.[0];
  const second = rows?.[1];
  const gap = leader && second ? leader.points - second.points : 0;
  const catchUpPct = leader && second && leader.points > 0 ? Math.min(100, Math.round((second.points / leader.points) * 100)) : 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Leaderboard</div>
          <h1 className={styles.title}>Ranked by points</h1>
          <p className={styles.sub}>Tap in for the full formula &mdash; money collected counts most, then deals closed, site visits, task/to-do throughput, and attendance.</p>
        </div>
        <select className={styles.yearSel} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}

      {rows && rows.length === 0 && !isLoading && <p style={{ color: 'var(--c-muted)' }}>No data yet.</p>}

      {leader && (
        <div className={styles.leaderCard}>
          <div className={styles.leaderTop}>
            <div className={styles.leaderAvatar}>{leader.staffName.charAt(0)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.leaderEyebrow}>🏆 Currently leading</div>
              <div className={styles.leaderName}>{leader.staffName}</div>
              <div className={styles.leaderMeta}>
                {ghs(leader.totalCollected)} collected &middot; {leader.dealsClosedYear} deal{leader.dealsClosedYear === 1 ? '' : 's'} closed {year} &middot; {leader.siteVisits} site visit
                {leader.siteVisits === 1 ? '' : 's'}
              </div>
            </div>
            <div className={styles.leaderPoints}>
              <div className={styles.leaderPointsVal}>{leader.points}</div>
              <div className={styles.leaderPointsLabel}>points</div>
            </div>
          </div>
          {second && (
            <div className={styles.catchUp}>
              <div className={styles.catchUpLabel}>
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
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className={styles.list}>
          {rows.map((r, i) => (
            <div className={`${styles.row} ${styles[ROW_TIER_CLASS[i]] ?? ''}`} key={r.staffKey}>
              <div className={`${styles.rank} ${styles[RANK_TIER_CLASS[i]] ?? ''}`}>{rank(i)}</div>
              <div className={styles.rowMain}>
                <div className={styles.rowName}>{r.staffName}</div>
                <div className={styles.pillRow}>
                  <span className={styles.pill}>{ghs(r.totalCollected)} collected</span>
                  <span className={styles.pill}>{r.dealsClosedYear} deals</span>
                  <span className={styles.pill}>{r.siteVisits} visits</span>
                  <span className={styles.pill}>{r.tasksCompleted} tasks</span>
                  <span className={styles.pill}>{r.todosCompleted} to-dos</span>
                  <span className={styles.pill}>
                    {r.daysAttended} days ({r.onTimeDays} on time)
                  </span>
                </div>
              </div>
              <div className={styles.rowPoints}>{r.points}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
