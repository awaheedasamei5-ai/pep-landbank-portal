import type { LeaderboardWeights } from '../../../types/domain';
import { ghs } from '../../../shared/lib/format';

// Port of index.html's paintPerformanceSection()'s "ways to close the
// gap" suggestions (index.html:16524-16531) -- for each weight the
// leaderboard actually uses, how many more of that thing would close
// the point gap to the agent directly above. A weight of 0 is skipped
// entirely (dividing by it would be meaningless, and a manager may have
// deliberately zeroed a factor out).
export function computeGapSuggestions(gap: number, weights: LeaderboardWeights): string[] {
  if (gap <= 0) return [];
  const suggestions: string[] = [];
  if (weights.siteVisits > 0) {
    const n = Math.ceil(gap / weights.siteVisits);
    suggestions.push(`${n} more site visit${n === 1 ? '' : 's'} would close the gap`);
  }
  if (weights.dealsClosed > 0) {
    const n = Math.ceil(gap / weights.dealsClosed);
    suggestions.push(`${n} more deal${n === 1 ? '' : 's'} closed would close the gap`);
  }
  if (weights.tasksCompleted > 0) {
    const n = Math.ceil(gap / weights.tasksCompleted);
    suggestions.push(`${n} more task${n === 1 ? '' : 's'} completed would close the gap`);
  }
  if (weights.regularity > 0) {
    const n = Math.ceil(gap / weights.regularity);
    suggestions.push(`${n} more day${n === 1 ? '' : 's'} attended would close the gap`);
  }
  if (weights.collected > 0) {
    const amt = Math.ceil(gap / weights.collected);
    suggestions.push(`${ghs(amt)} more collected would close the gap`);
  }
  return suggestions;
}

// Merges in the one metric leaderboard_rows() doesn't already cover
// (referralConversions, a separate RPC -- see usePortfolio.ts), the same
// join index.html's own mergeReferralConversions() does. Generic over
// the row shape so it works on either the raw unscored rows or the
// fully-scored ones.
export function mergeReferralConversions<T extends { staffKey: string }>(rows: T[], conversions: { staffKey: string; referralConversions: number }[]): (T & { referralConversions: number })[] {
  const byKey = new Map(conversions.map((c) => [c.staffKey, c.referralConversions]));
  return rows.map((r) => ({ ...r, referralConversions: byKey.get(r.staffKey) ?? 0 }));
}
