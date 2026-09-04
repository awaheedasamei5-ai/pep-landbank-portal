import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { Lead, NewLead } from '../../../types/domain';
import { friendlyError } from '../../../shared/lib/friendlyError';

export function useLeads() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['leads', agentKey],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).leads.listForAgent(agentKey),
  });
}

// Master Spec Section 4.4: amt_paid is never a free field -- leads.create()
// (both DataSource implementations) always inserts amt_paid=0 regardless of
// input.amtPaid. A nonzero opening deposit becomes a real Payment row here,
// created right after the lead exists (needs a real leadId), through the
// exact same status rule useCreatePayment already uses (manager self-
// approves; 'elias' logs it pending -- matches the real payments_ins RLS,
// which only those two identities can insert at all). The result carries
// a `depositError` rather than throwing if the lead saved but the deposit
// didn't -- the lead is real and should not be discarded/retried into a
// duplicate just because the second step failed; the caller can log the
// deposit as a normal payment afterward.
export function useCreateLead() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewLead): Promise<{ lead: Lead; depositError: string | null }> => {
      const ds = getDataSource(demoMode);
      const lead = await ds.leads.create(agentKey, input);
      let depositError: string | null = null;
      if (input.amtPaid > 0) {
        const canLog = profile?.role === 'manager' || profile?.key === 'elias';
        if (canLog) {
          try {
            await ds.payments.create({ leadId: lead.id, amount: input.amtPaid }, lead.name, agentKey, profile?.role === 'manager' ? 'approved' : 'pending');
          } catch (e) {
            depositError = friendlyError(e, 'The lead was saved, but the opening deposit could not be recorded. Log it as a payment from the lead’s page.');
          }
        } else {
          depositError = "The lead was saved, but only Elias or Management can log a payment -- ask them to record the opening deposit.";
        }
      }
      return { lead, depositError };
    },
    onSuccess: () => {
      // Same "one funnel, invalidate on write" pattern the realtime bridge
      // will use once live subscriptions exist (see data/realtime/ in a
      // later phase) -- for demo mode this just re-reads the updated array.
      queryClient.invalidateQueries({ queryKey: ['leads', agentKey] });
      queryClient.invalidateQueries({ queryKey: ['pipelineSummary', agentKey] });
      queryClient.invalidateQueries({ queryKey: ['paymentsPending'] });
    },
  });
}
