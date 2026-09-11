import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import {
  buildContractProductionReport,
  buildOutstandingRequestsReport,
  buildMissingInformationReport,
  buildTemplateUsageReport,
  buildTurnaroundReport,
  buildDocumentStatusReport,
  contractReportFilename,
} from '../lib/contractReportsPdf';
import type { Contract, ContractGeneration, ContractRequest, ContractTemplate, Lead } from '../../../types/domain';

export type ContractReportKind = 'production' | 'outstanding' | 'missing_info' | 'template_usage' | 'turnaround' | 'document_status';

interface ReportData {
  kind: ContractReportKind;
  contracts: Contract[];
  generations: ContractGeneration[];
  requests: ContractRequest[];
  templates: ContractTemplate[];
  leads: Lead[];
}

// CONTRACT_OF_SALE_BLUEPRINT.md §11 -- one mutation, branching on `kind`,
// same "on-demand, live figures, nothing pre-generated" discipline as the
// company-wide ReportsScreen. All 6 builders live in contractReportsPdf.ts;
// this hook only gathers the real data each needs and loads the logo.
export function useDownloadContractReport() {
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  return useMutation({
    mutationFn: async (data: ReportData) => {
      let logo: string | null = null;
      try {
        logo = await loadImageAsDataUri('/trulander-logo.png');
      } catch {
        // Missing/blocked logo shouldn't stop the report from generating.
      }
      const h = { generatedByName: profile?.name ?? 'Management', companyName: config?.quoteCompanyName, logoDataUri: logo };
      const leadsById = new Map(data.leads.map((l) => [l.id, l]));

      let doc;
      switch (data.kind) {
        case 'production':
          doc = buildContractProductionReport(data.contracts, data.generations, h);
          break;
        case 'outstanding':
          doc = buildOutstandingRequestsReport(data.requests, h);
          break;
        case 'missing_info':
          doc = buildMissingInformationReport(data.requests, leadsById, h);
          break;
        case 'template_usage':
          doc = buildTemplateUsageReport(data.generations, data.templates, h);
          break;
        case 'turnaround':
          doc = buildTurnaroundReport(data.requests, h);
          break;
        case 'document_status':
          doc = buildDocumentStatusReport(data.requests, data.contracts, h);
          break;
      }
      doc.save(contractReportFilename(data.kind));
    },
  });
}
