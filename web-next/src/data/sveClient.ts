import { getSupabaseClient } from './client';
import type { SiteVisitInvite, SveSubmissionInput, SveSubmitResult } from '../types/domain';

// Deliberately separate from data/source.ts's DataSource seam -- a public
// visitor filling out this form has no session/profile, so there's no
// demoMode to key off of and no agent-scoped concept of "own data" here
// at all. Both calls go through the two SECURITY DEFINER RPCs added this
// session (get_site_visit_invite/submit_site_visit_experience) on both
// staging and production -- see the SiteVisitInvite type's comment in
// types/domain.ts for why a direct table query/insert isn't possible
// here (RLS is closed to anon; the RPCs are the only sanctioned path).

export async function getSiteVisitInvite(token: string): Promise<SiteVisitInvite | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.rpc('get_site_visit_invite', { p_token: token });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    inviteId: row.invite_id,
    clientName: row.client_name ?? null,
    site: row.site ?? null,
    plot: row.plot ?? null,
    visitDate: row.visit_date ?? null,
    alreadySubmitted: !!row.already_submitted,
  };
}

export async function submitSiteVisitExperience(token: string, input: SveSubmissionInput): Promise<SveSubmitResult> {
  const client = getSupabaseClient();
  if (!client) throw new Error('This form is not available right now -- please try again later.');
  const { data, error } = await client.rpc('submit_site_visit_experience', {
    p_token: token,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_site_visited: input.siteVisited ?? null,
    p_visit_date: input.visitDate ?? null,
    p_journey_rating: input.journeyRating ?? null,
    p_site_manager_name: input.siteManagerName ?? null,
    p_relationship_rating: input.relationshipRating ?? null,
    p_handling_feedback: input.handlingFeedback ?? null,
    p_site_description_rating: input.siteDescriptionRating ?? null,
    p_below_expectation_reason: input.belowExpectationReason ?? null,
    p_overall_rating: input.overallRating ?? null,
    p_nps_score: input.npsScore ?? null,
    p_improvement_suggestions: input.improvementSuggestions ?? null,
    p_purchase_intent: input.purchaseIntent ?? null,
    p_additional_comments: input.additionalComments ?? null,
  });
  if (error) throw error;
  return data as SveSubmitResult;
}
