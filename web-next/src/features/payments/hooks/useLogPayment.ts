import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewPaymentEntry } from '../../../types/domain';

// Real RLS (payments_ins, confirmed live): only manager or the 'elias'
// key may log a payment at all. Screens use this to gate visibility, not
// just to decide the resulting status.
export function useCanLogPayments(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return !!profile && (profile.role === 'manager' || profile.key === 'elias');
}

export function useAllLeads() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['leadsAll'], queryFn: () => getDataSource(demoMode).leads.listAll() });
}

export function usePendingPayments() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['paymentsPending'], queryFn: () => getDataSource(demoMode).payments.listPending() });
}

function useInvalidatePaymentEffects() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['leadsAll'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['lead'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['paymentsPending'] });
    queryClient.invalidateQueries({ queryKey: ['pipelineSummary'] });
    queryClient.invalidateQueries({ queryKey: ['managerOverview'] });
  };
}

// Status is decided here, once, matching logNewPayment()'s exact real
// rule -- a manager's own entry is immediately 'approved' (self-approve,
// no review needed); 'elias' logging it is always 'pending' regardless
// of who the lead's own agent is, since elias isn't Management and the
// real RLS/RPC gate on approve_payment requires my_role()='manager'.
export function useCreatePayment() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const invalidate = useInvalidatePaymentEffects();

  return useMutation({
    mutationFn: ({ input, leadName, leadAgentKey }: { input: NewPaymentEntry; leadName: string; leadAgentKey: string }) => {
      const status = profile?.role === 'manager' ? 'approved' : 'pending';
      return getDataSource(demoMode).payments.create(input, leadName, leadAgentKey, status);
    },
    onSuccess: invalidate,
  });
}

export function useApprovePayment() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const invalidate = useInvalidatePaymentEffects();

  return useMutation({
    mutationFn: (paymentId: string) => getDataSource(demoMode).payments.approve(paymentId, profile?.key ?? '', profile?.name ?? ''),
    onSuccess: invalidate,
  });
}

export function useDeclinePayment() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const invalidate = useInvalidatePaymentEffects();

  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason?: string }) => getDataSource(demoMode).payments.decline(paymentId, profile?.key ?? '', profile?.name ?? '', reason),
    onSuccess: invalidate,
  });
}
