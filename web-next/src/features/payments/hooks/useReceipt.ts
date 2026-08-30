import { useMutation, useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { buildReceiptPdf } from '../lib/receiptPdf';
import type { Lead, Payment } from '../../../types/domain';

// Resolves a private receipt_proof_path into something an <img> can
// render -- a signed URL live, the data URI itself in demo mode (see
// DataSource.payments.resolveProofUrl's own comment). staleTime is long:
// the signed URL is only valid 5 minutes, but re-resolving on every
// refocus would spam Storage for no reason -- a stale image for a few
// minutes on an already-decided payment is harmless.
export function useProofUrl(path: string | null | undefined) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['paymentProofUrl', path],
    enabled: !!path,
    staleTime: 1000 * 60 * 4,
    queryFn: () => getDataSource(demoMode).payments.resolveProofUrl(path as string),
  });
}

// Generates the approved receipt PDF (same buildReceiptPdf used for local
// download), uploads it to the private receipts bucket, and creates the
// share-link row -- returns a ready-to-copy /receipt/:token URL, the one
// link both the client and the staff member in charge use.
export function useIssueReceiptLink() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  return useMutation({
    mutationFn: async ({ payment, lead }: { payment: Payment; lead: Lead | null }) => {
      if (!config) throw new Error('Config not loaded yet');
      const receiptNumber = await getDataSource(demoMode).payments.ensureReceiptNumber(payment.id);
      const doc = buildReceiptPdf({ clientName: payment.clientName ?? lead?.name ?? 'Client', payment, lead, receiptNumber, config, issuerSignature: profile?.signatureData ?? null });
      const blob = doc.output('blob');
      const token = await getDataSource(demoMode).payments.issueReceiptLink(payment.id, blob, profile?.key ?? '');
      return `${window.location.origin}/receipt/${token}`;
    },
  });
}

// Mints/reuses the real permanent receipt number (ensure_receipt_number
// RPC) then builds and downloads the branded PDF. Only meaningful for an
// approved payment -- the screen calling this is responsible for only
// offering it on those.
export function useDownloadReceipt() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  return useMutation({
    mutationFn: async ({ payment, lead }: { payment: Payment; lead: Lead | null }) => {
      if (!config) throw new Error('Config not loaded yet');
      const receiptNumber = await getDataSource(demoMode).payments.ensureReceiptNumber(payment.id);
      const doc = buildReceiptPdf({ clientName: payment.clientName ?? lead?.name ?? 'Client', payment, lead, receiptNumber, config, issuerSignature: profile?.signatureData ?? null });
      doc.save(`Receipt_${receiptNumber}.pdf`);
      return receiptNumber;
    },
  });
}
