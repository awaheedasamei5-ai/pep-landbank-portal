type Visit = { id: string; visit_date: string; attended: boolean | null; deleted_at: string | null; lead_id: string | null };
type Invite = { id: string; site_visit_id: string; sent_at: string | null };
type Survey = { invite_id: string };
type Cost = { lead_id: string; source_id: string };
type CostDay = { id: string; visit_date: string };

export function visitReviewQueue<T extends Visit>(visits: T[], today: string, data: {
  invites: Invite[]; surveys: Survey[]; costs: Cost[]; costDays: CostDay[];
}) {
  const invitesByVisit = new Map<string, Invite[]>();
  for (const invite of data.invites) invitesByVisit.set(invite.site_visit_id, [...(invitesByVisit.get(invite.site_visit_id) ?? []), invite]);
  const respondedInvites = new Set(data.surveys.map((survey) => survey.invite_id));
  const dayByForm = new Map(data.costDays.map((day) => [day.id, day.visit_date]));
  const costsByLead = new Map<string, Cost[]>();
  for (const cost of data.costs) costsByLead.set(cost.lead_id, [...(costsByLead.get(cost.lead_id) ?? []), cost]);

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
      if (visit.lead_id && !(costsByLead.get(visit.lead_id) ?? []).some((cost) => dayByForm.get(cost.source_id) === visit.visit_date)) {
        actions.push('Review visit cost attribution');
      }
    }
    return actions.length ? [{ visit, actions }] : [];
  });
}
