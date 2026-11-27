interface VisitForFollowThrough {
  id: string;
  lead_id: string | null;
  visit_date: string;
  attended: boolean | null;
  deleted_at: string | null;
}

interface FollowThroughData {
  payments: { lead_id: string; amount: number; payment_date: string }[];
  allocations: { visit_id: string; amount: number }[];
  invites: { id: string; site_visit_id: string }[];
  surveys: { invite_id: string; created_at: string; purchase_intent: string | null }[];
}

// Later payments can appear after multiple visits by one lead, while approved
// cost is attached to a single attended visit and can be summed by cohort.
export function visitFollowThrough<TVisit extends VisitForFollowThrough>(visits: TVisit[], data: FollowThroughData | undefined) {
  const allocationByVisit = new Map((data?.allocations ?? []).map((row) => [row.visit_id, row.amount]));
  const surveysByInvite = new Map((data?.surveys ?? []).map((survey) => [survey.invite_id, survey]));
  const paymentsByLead = new Map<string, FollowThroughData['payments']>();
  for (const payment of data?.payments ?? []) {
    paymentsByLead.set(payment.lead_id, [...(paymentsByLead.get(payment.lead_id) ?? []), payment]);
  }
  const invitesByVisit = new Map<string, FollowThroughData['invites']>();
  for (const invite of data?.invites ?? []) {
    invitesByVisit.set(invite.site_visit_id, [...(invitesByVisit.get(invite.site_visit_id) ?? []), invite]);
  }
  return visits.filter((visit) => !visit.deleted_at && visit.attended === true && !!visit.lead_id).map((visit) => {
    const payments = (paymentsByLead.get(visit.lead_id!) ?? []).filter((payment) => payment.payment_date >= visit.visit_date);
    const surveys = (invitesByVisit.get(visit.id) ?? [])
      .map((invite) => surveysByInvite.get(invite.id))
      .filter((survey): survey is NonNullable<typeof survey> => !!survey)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      visit,
      laterReceipts: payments.length,
      laterCash: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      matchedCost: allocationByVisit.has(visit.id) ? Number(allocationByVisit.get(visit.id) || 0) : null,
      purchaseIntent: surveys[0]?.purchase_intent?.trim() || null,
    };
  });
}
