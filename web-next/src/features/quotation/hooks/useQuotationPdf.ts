import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildQuotationPdf, quotationFilename, type QuotationClientInfo } from '../lib/quotationPdf';
import type { Config } from '../../../types/domain';
import type { QuotationTotals } from '../lib/quotationLogic';

// Pure client-side render, matching the calculator's own "nothing saved,
// nothing sent" design -- no RPC, no receipt-number-style persisted
// identifier, unlike the payment receipt PDF.
export function useDownloadQuotationPdf() {
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async ({ totals, noPlots, client, config }: { totals: QuotationTotals; noPlots: number; client: QuotationClientInfo; config: Config }) => {
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/trulander-logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the quotation from generating.
      }
      const doc = buildQuotationPdf(totals, noPlots, client, config, logo, profile?.name ?? '', profile?.signatureData ?? null);
      doc.save(quotationFilename(client.name));
    },
  });
}
