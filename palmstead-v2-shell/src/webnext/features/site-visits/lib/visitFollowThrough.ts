interface VisitForFollowThrough {
  id: string;
  lead_id: string | null;
  visit_date: string;
  attended: boolean | null;
  deleted_at: string | null;
}

interface FollowThroughData {
  payments: { lead_id: string; amount: number; payment_date: string }[];
  costs: { lead_id: string; source_id: string; amount: number }[];
  costDays: { id: string; visit_date: string }[];
  invites: { id: string; site_visit_id: string }[];
  surveys: { invite_id: string; created_at: string; purchase_intent: string | null }[];
}

// Visit-level evidence is separate from deduplicated report totals. A lead may
// visit twice, so later payments or same-day cost attributions can appear on
// more than one visit row. These rows must never be summed as new revenue.
export function visitFollowThrough<TVisit extends VisitForFollowThrough>(visits: TVisit[], data: FollowThroughData | undefined) {
  const formDay = new Map((data?.costDays ?? []).map((form) => [form.id, form.visit_date]));
  const surveysByInvite = new Map((data?.surveys ?? []).map((survey) => [survey.invite_id, survey]));
  const paymentsByLead = new Map<string, FollowThroughData['payments']>();
  for (const payment of data?.payments ?? []) {
    paymentsByLead.set(payment.lead_id, [...(paymentsByLead.get(payment.lead_id) ?? []), payment]);
  }
  const costsByLead = new Map<string, FollowThroughData['costs']>();
  for (const cost of data?.costs ?? []) {
    costsByLead.set(cost.lead_id, [...(costsByLead.get(cost.lead_id) ?? []), cost]);
  }
  const invitesByVisit = new Map<string, FollowThroughData['invites']>();
  for (const invite of data?.invites ?? []) {
    invitesByVisit.set(invite.site_visit_id, [...(invitesByVisit.get(invite.site_visit_id) ?? []), invite]);
  }
  return visits.filter((visit) => !visit.deleted_at && visit.attended === true && !!visit.lead_id).map((visit) => {
    const payments = (paymentsByLead.get(visit.lead_id!) ?? []).filter((payment) => payment.payment_date >= visit.visit_date);
    const costs = (costsByLead.get(visit.lead_id!) ?? []).filter((cost) => formDay.get(cost.source_id) === visit.visit_date);
    const surveys = (invitesByVisit.get(visit.id) ?? [])
      .map((invite) => surveysByInvite.get(invite.id))
      .filter((survey): survey is NonNullable<typeof survey> => !!survey)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      visit,
      laterReceipts: payments.length,
      laterCash: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      matchedCost: costs.length ? costs.reduce((sum, cost) => sum + Number(cost.amount || 0), 0) : null,
      purchaseIntent: surveys[0]?.purchase_intent?.trim() || null,
    };
  });
}
