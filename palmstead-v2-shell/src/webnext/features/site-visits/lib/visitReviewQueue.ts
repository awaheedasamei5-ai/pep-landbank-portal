type Visit = { id: string; visit_date: string; attended: boolean | null; deleted_at: string | null; lead_id: string | null };
type Invite = { id: string; site_visit_id: string; sent_at: string | null };
type Survey = { invite_id: string };
type Allocation = { visit_id: string };

export function visitReviewQueue<T extends Visit>(visits: T[], today: string, data: {
  invites: Invite[]; surveys: Survey[]; allocations: Allocation[];
}) {
  const invitesByVisit = new Map<string, Invite[]>();
  for (const invite of data.invites) invitesByVisit.set(invite.site_visit_id, [...(invitesByVisit.get(invite.site_visit_id) ?? []), invite]);
  const respondedInvites = new Set(data.surveys.map((survey) => survey.invite_id));
  const costedVisitIds = new Set(data.allocations.map((row) => row.visit_id));

  return visits.flatMap((visit) => {
    if (visit.deleted_at || visit.visit_date >= today) return [];
    const actions: string[] = [];
    if (visit.attended === null) actions.push('Confirm attendance');
    if (visit.attended === true) {
      if (!visit.lead_id) actions.push('Link pipeline lead');
      const invites = invitesByVisit.get(visit.id) ?? [];
      if (!invites.some((invite) => respondedInvites.has(invite.id))) {
        actions.push(invites.some((invite) => !!invite.sent_at) ? 'Follow up on client feedback' : 'Invite client feedback');
      }
      if (!costedVisitIds.has(visit.id)) {
        actions.push('Review or approve actual visit cost');
      }
    }
    return actions.length ? [{ visit, actions }] : [];
  });
}
