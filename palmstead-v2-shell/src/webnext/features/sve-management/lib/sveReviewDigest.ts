import { SVE_REVIEW_QUESTIONS } from '../../../types/domain';
import type { SveReviewAnswers } from '../../../types/domain';

// Turns the site manager's structured per-client debrief (v1's own real
// SVE_REVIEW_QUESTIONS, index.html:15226-15237) into a plain "Q: A" digest
// -- fed to the AI-polish pass as the "raw notes" it composes into
// professional prose (usePolishManagerNarrative's existing prompt already
// handles arbitrary raw text; this just gives it real structured, grounded
// facts instead of one vague paragraph), and shown/printed as-is whenever
// no AI narrative has been generated yet for that client.
export function reviewDigest(review: SveReviewAnswers | null): string {
  if (!review) return '';
  return SVE_REVIEW_QUESTIONS.map((q) => {
    const v = review[q.key];
    if (v == null || v === '') return null;
    const value = q.type === 'rating' ? `${v}/5` : String(v);
    return `${q.label} ${value}`;
  })
    .filter((line): line is string => !!line)
    .join('\n');
}

export function reviewIsAnswered(review: SveReviewAnswers | null): boolean {
  if (!review) return false;
  return SVE_REVIEW_QUESTIONS.some((q) => review[q.key] != null && review[q.key] !== '');
}
