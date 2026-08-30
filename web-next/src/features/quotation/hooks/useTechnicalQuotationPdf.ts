import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildTechnicalQuotationPdf, technicalQuotationFilename } from '../lib/technicalQuotationPdf';
import type { QuotationClientInfo } from '../lib/quotationPdf';
import type { Config } from '../../../types/domain';
import type { TechnicalQuotationTotals } from '../lib/quotationLogic';

export function useDownloadTechnicalQuotationPdf() {
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async ({ totals, client, config }: { totals: TechnicalQuotationTotals; client: QuotationClientInfo; config: Config }) => {
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/trulander-logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the quotation from generating.
      }
      const doc = buildTechnicalQuotationPdf(totals, client, config, logo, profile?.name ?? '', profile?.signatureData ?? null);
      doc.save(technicalQuotationFilename(client.name));
    },
  });
}
