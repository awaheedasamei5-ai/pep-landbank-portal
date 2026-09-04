import { useNavigate } from 'react-router';
import { usePortfolio } from '../hooks/usePortfolio';
import styles from './PortfolioScreen.module.css';

// New screen -- the data layer (usePortfolio.ts/portfolioLogic.ts) has
// existed since an earlier pass but was never wired to a screen (see
// PHASE0_INVENTORY.md §8 / the Blueprint's Phase 7 roadmap: "Portfolio /
// achievements" was the one item left unshipped once the underlying
// leaderboard/achievement infrastructure it depends on was solid enough
// to build on). Two halves, both already fully computed by the hook:
// rank/points/gap-to-next-with-suggestions (index.html's own
// paintPerformanceSection, ported faithfully into usePortfolio.ts), and
// the achievement badge grid (earned vs locked-with-progress), which
// index.html never had a dedicated screen for at all -- award() has
// always run, nothing ever showed a staff member what they'd earned.
export function PortfolioScreen() {
  const navigate = useNavigate();
  const portfolio = usePortfolio();

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className={styles.eyebrow}>My Portfolio</div>
      <h1 className={styles.title}>Performance &amp; Achievements</h1>
      <p className={styles.sub}>Where you rank this year, what closes the gap, and every badge you've earned.</p>

      {portfolio.isLoading && <p className={styles.emptyMsg}>Loading…</p>}

      {!portfolio.isLoading && portfolio.rank == null && <p className={styles.emptyMsg}>No leaderboard data yet this year.</p>}

      {!portfolio.isLoading && portfolio.rank != null && (
        <>
          <div className={styles.heroCard}>
            <div className={styles.rankNum}>#{portfolio.rank}</div>
            <div>
              <div className={styles.rankMeta}>of {portfolio.totalRanked} on the team this year</div>
              <div className={styles.rankPoints}>{portfolio.points} points</div>
            </div>
          </div>

          <div className={styles.gapCard}>
            {portfolio.aboveName ? (
              <>
                <div className={styles.gapLabel}>Gap to {portfolio.aboveName}</div>
                <div className={styles.gapValue}>
                  {portfolio.gap} point{portfolio.gap === 1 ? '' : 's'}
                </div>
                {portfolio.suggestions.length > 0 && (
                  <ul className={styles.suggestList}>
                    {portfolio.suggestions.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className={styles.gapValueZero}>You&apos;re #1 on the team — keep it up 🎉</div>
            )}
          </div>
        </>
      )}

      <div className={styles.sectionTitle}>
        Achievements ({portfolio.earned.length} of {portfolio.defs.length})
      </div>
      <div className={styles.achGrid}>
        {portfolio.defs.map((def) => {
          const earned = portfolio.earned.find((e) => e.achievementId === def.id);
          const threshold = def.criteriaConfig?.threshold ?? null;
          const progressValue = earned?.progress?.value ?? null;
          const pct = !earned && threshold ? Math.min(100, Math.round(((progressValue ?? 0) / threshold) * 100)) : null;
          return (
            <div key={def.id} className={`${styles.achCard} ${earned ? '' : styles.achCardLocked}`}>
              <div className={styles.achIcon}>{def.icon || '🏅'}</div>
              <div className={styles.achLabel}>{def.label}</div>
              <div className={styles.achPoints}>{def.points} pts</div>
              {earned ? (
                <div className={styles.achEarnedDate}>Earned {new Date(earned.earnedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
              ) : (
                <>
                  {threshold != null && <div className={styles.achProgress}>Reach {threshold}</div>}
                  {pct != null && (
                    <div className={styles.achBarTrack}>
                      <div className={styles.achBarFill} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
