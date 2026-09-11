import type { LeaderboardRow, LeaderboardWeights } from '../../../types/domain';

// Ported exactly from index.html's agentPoints() (index.html:19590-19596) --
// same formula, same speed-bonus shape (rewards fast task turnaround, capped
// at 10 days, zeroed out entirely for an agent with no completed tasks so an
// idle agent can't collect the bonus). Points are a rough momentum measure,
// not a formal KPI -- collected value is deliberately the biggest factor.
//
// IMPORTANT 2026-09-10: this is NO LONGER the authoritative score source.
// The real Leaderboard/Portfolio screens read `points` from the server
// (recompute_leaderboard_scores() SQL function, mirrors this exact
// formula -- keep both in sync if the formula ever changes) via
// ds.manager.leaderboardScores(). This function now only backs (a) demo
// mode, which has no real DB to compute against, and (b) legitimate
// client-side "what-if" previews (e.g. a future admin what-if weight
// preview) where recomputing hypothetically, without persisting, is the
// whole point. Never wire a real screen's displayed score back to this.
export function agentPoints(row: Omit<LeaderboardRow, 'points'>, weights: LeaderboardWeights): number {
  const speedBonus = row.avgTaskDays != null ? Math.max(0, weights.taskSpeedBonus * (1 - Math.min(row.avgTaskDays, 10) / 10)) : 0;
  return Math.round(
    row.totalCollected * weights.collected +
      row.dealsClosedYear * weights.dealsClosed +
      row.siteVisits * weights.siteVisits +
      row.tasksCompleted * weights.tasksCompleted +
      row.todosCompleted * weights.todosCompleted +
      speedBonus * (row.tasksCompleted ? 1 : 0) +
      row.daysAttended * weights.regularity +
      row.onTimeDays * weights.punctuality,
  );
}

// Deterministic spike detection for the score-change audit log -- the
// same "system decides, AI only drafts language" pattern already
// established for Attendance's Praise/Warning (see
// project-attendance-leave-v2-spec memory): real TypeScript decides
// WHETHER a score jump deserves a second look, never an LLM call. AI
// (leaderboard_spike_alert) only drafts the wording once this already
// said yes. A jump counts as worth a look if it's a large absolute swing
// OR more than doubles a meaningful prior score -- either alone is a
// real, explainable trigger, not a guess.
const SPIKE_ABSOLUTE_THRESHOLD = 150;
const SPIKE_RELATIVE_THRESHOLD = 0.5;

export function isScoreSpike(entry: { oldPoints: number; newPoints: number }): boolean {
  const delta = Math.abs(entry.newPoints - entry.oldPoints);
  if (delta >= SPIKE_ABSOLUTE_THRESHOLD) return true;
  if (entry.oldPoints > 0 && delta / entry.oldPoints >= SPIKE_RELATIVE_THRESHOLD) return true;
  return false;
}
