import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Real bug found while testing the payment-receipt feature: this used to
// call listForAgent(viewerKey), so a manager opening someone else's lead
// (via Manager Home's drill-down or Company Pipeline) always saw "no
// payments" -- filtered to the VIEWER's own payments, not the lead being
// looked at. listForLead(leadId) relies on real payments_sel RLS to scope
// correctly for everyone (see its DataSource comment), so this needs no
// role branching at all.
export function usePayments(leadId: string) {
  const demoMode = useSessionStore((s) => s.demoMode);

  return useQuery({
    queryKey: ['payments', leadId],
    enabled: !!leadId,
    queryFn: () => getDataSource(demoMode).payments.listForLead(leadId),
  });
}
