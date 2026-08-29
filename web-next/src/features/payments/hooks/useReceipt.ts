import { useMutation } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { buildReceiptPdf } from '../lib/receiptPdf';
import type { Lead, Payment } from '../../../types/domain';

// Mints/reuses the real permanent receipt number (ensure_receipt_number
// RPC) then builds and downloads the branded PDF. Only meaningful for an
// approved payment -- the screen calling this is responsible for only
// offering it on those.
export function useDownloadReceipt() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: config } = useConfig();
  return useMutation({
    mutationFn: async ({ payment, lead }: { payment: Payment; lead: Lead | null }) => {
      if (!config) throw new Error('Config not loaded yet');
      const receiptNumber = await getDataSource(demoMode).payments.ensureReceiptNumber(payment.id);
      const doc = buildReceiptPdf({ clientName: payment.clientName ?? lead?.name ?? 'Client', payment, lead, receiptNumber, config });
      doc.save(`Receipt_${receiptNumber}.pdf`);
      return receiptNumber;
    },
  });
}
