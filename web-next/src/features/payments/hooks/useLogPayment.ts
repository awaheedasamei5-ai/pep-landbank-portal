import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewPaymentEntry, PaymentMethod } from '../../../types/domain';

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

export function useNeedsCorrectionPayments() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['paymentsNeedsCorrection'], queryFn: () => getDataSource(demoMode).payments.listNeedsCorrection() });
}

function useInvalidatePaymentEffects() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['leadsAll'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['lead'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['paymentsPending'] });
    queryClient.invalidateQueries({ queryKey: ['paymentsNeedsCorrection'] });
    queryClient.invalidateQueries({ queryKey: ['activityForLead'] });
    queryClient.invalidateQueries({ queryKey: ['auditForLead'] });
    queryClient.invalidateQueries({ queryKey: ['pipelineSummary'] });
    queryClient.invalidateQueries({ queryKey: ['managerOverview'] });
  };
}

// Status is decided here, once, matching logNewPayment()'s exact real
// rule -- a manager's own entry is immediately 'approved' (self-approve,
// no review needed); 'elias' logging it is always 'pending' regardless
// of who the lead's own agent is, since elias isn't Management and the
// real RLS/RPC gate on approve_payment requires my_role()='manager'.
// A payment that lands 'approved' (either immediately here, or later via
// useApprovePayment) fires the client's real thank-you SMS -- matches
// applyApprovedPaymentToLead's own apiSendSms call (index.html:4259),
// fire-and-forget so a failed text never blocks the payment itself.
export function useCreatePayment() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const invalidate = useInvalidatePaymentEffects();

  return useMutation({
    mutationFn: async ({ input, leadName, leadAgentKey, leadContact }: { input: NewPaymentEntry; leadName: string; leadAgentKey: string; leadContact?: string }) => {
      const status = profile?.role === 'manager' ? 'approved' : 'pending';
      const payment = await getDataSource(demoMode).payments.create(input, leadName, leadAgentKey, status);
      if (status === 'approved' && leadContact) {
        getDataSource(demoMode)
          .sms.send(leadContact, `Hi ${leadName}, thank you for your payment of GHS ${input.amount.toLocaleString('en-GH')} towards your plot at Royal Palm Enclave. - PEP Landbank`, 'payment_thanks', profile?.key ?? null)
          .catch(() => {});
      }
      return payment;
    },
    onSuccess: invalidate,
  });
}

export function useApprovePayment() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const invalidate = useInvalidatePaymentEffects();

  return useMutation({
    mutationFn: async ({ paymentId, leadName, leadContact, amount }: { paymentId: string; leadName?: string; leadContact?: string; amount?: number }) => {
      const result = await getDataSource(demoMode).payments.approve(paymentId, profile?.key ?? '', profile?.name ?? '');
      if (leadContact && leadName && amount != null) {
        getDataSource(demoMode)
          .sms.send(leadContact, `Hi ${leadName}, thank you for your payment of GHS ${amount.toLocaleString('en-GH')} towards your plot at Royal Palm Enclave. - PEP Landbank`, 'payment_thanks', profile?.key ?? null)
          .catch(() => {});
      }
      return result;
    },
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

// Master Spec Section 6's Needs-Correction workflow -- manager sends a
// pending payment back for a fix instead of declining it outright.
export function useFlagPaymentNeedsCorrection() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const invalidate = useInvalidatePaymentEffects();

  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => getDataSource(demoMode).payments.flagNeedsCorrection(paymentId, reason),
    onSuccess: invalidate,
  });
}

// The logging staff member (or manager) edits the flagged payment and
// sends it back to 'pending' for a fresh review.
export function useResubmitPayment() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const invalidate = useInvalidatePaymentEffects();

  return useMutation({
    mutationFn: ({ paymentId, input }: { paymentId: string; input: { amount: number; paymentMethod?: PaymentMethod | null; note?: string | null; receiptProofPath?: string | null } }) =>
      getDataSource(demoMode).payments.resubmit(paymentId, input),
    onSuccess: invalidate,
  });
}

// Uploads the agent's proof-of-payment photo -- called right after
// useCreatePayment succeeds (needs the real payment id first), not
// bundled into the same mutation, so a failed upload never blocks the
// payment itself from being logged.
export function useUploadPaymentProof() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const invalidate = useInvalidatePaymentEffects();

  return useMutation({
    mutationFn: ({ paymentId, file }: { paymentId: string; file: File }) => getDataSource(demoMode).payments.uploadProof(paymentId, profile?.key ?? '', file),
    onSuccess: invalidate,
  });
}
