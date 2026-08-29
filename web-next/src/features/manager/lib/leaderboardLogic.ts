import type { LeaderboardRow, LeaderboardWeights } from '../../../types/domain';

// Ported exactly from index.html's agentPoints() (index.html:19590-19596) --
// same formula, same speed-bonus shape (rewards fast task turnaround, capped
// at 10 days, zeroed out entirely for an agent with no completed tasks so an
// idle agent can't collect the bonus). Points are a rough momentum measure,
// not a formal KPI -- collected value is deliberately the biggest factor.
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
