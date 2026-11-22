import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { useLogDownload } from '../../../shared/hooks/useLogDownload';
import { contractFilename, prepareStandardContractPdf } from '../lib/contractPdf';
import { buildContractFromSections } from '../lib/contractSectionsPdf';
import { resolveContractFields, resolveSections, findUnresolvedTokens } from '../lib/contractFieldResolver';
import type { Config, ContractSection, Lead } from '../../../types/domain';

export function useContracts() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ['contracts'],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).contracts.list(),
  });
}

// CONTRACT_OF_SALE_BLUEPRINT.md §8 -- picking a published template is
// optional. Generate() is called plainly with a lead:
export type GenerateContractInput = {
  lead: Lead;
  // Omitted/undefined => the standard ten-page document. For an existing
  // lead this retains the legacy metadata path; a walk-in gets a stored
  // PDF snapshot because there is no lead row for legacy metadata.
  // Provided => the new template studio path: resolve -> render ->
  // upload -> snapshot, per §8 steps 1-3.
  template?: {
    templateId: string;
    templateVersionId: string;
    versionNumber: number;
    templateName: string;
    content: ContractSection[];
  };
  contractRequestId?: string | null;
  // docs/plans/17-contract-of-sale-v3-gaps-plan.md Phase 3 -- a walk-in
  // client (typed in directly, never added to the real leads table) has
  // no real lead.id to record. The standard renderer stores its PDF in
  // contract_generations with a null lead/template pointer.
  isWalkIn?: boolean;
  // Overrides resolveContractFields' default (lead.amtPaid) -- the real
  // fix for "let us enter the amount already paid before generating",
  // used both for a walk-in's typed-in figure and for re-stating an
  // existing lead's current real amount at generation time.
  amountPaidOverride?: number;
  acresOverride?: number;
  legalOverride?: Pick<Config, 'contractPreamble' | 'contractDefinitions' | 'contractTerms'>;
};

// Builds the branded PDF and downloads it. Without a template, existing
// leads retain the v1-parity metadata path. Walk-ins store the same ten-page
// renderer's PDF and resolved-field snapshot in the private vault.
//
// With a template, this is the new §8 generation-time snapshot: every
// {{token}} in the PUBLISHED version's content is resolved against real
// lead/KYC data, blocked by a plain-English missing-fields guard if any
// token survives unresolved, the resulting content_snapshot is rendered
// with the same renderer the editor's own Preview uses (byte-identical
// layout), uploaded to the private contract-pdfs bucket, and recorded as
// a real content-bearing contract_generations row -- never a live FK back
// to the mutable template, so later template edits can never retroactively
// alter what a past generation shows (Documenso's own snapshot-by-deep-
// copy discipline, adopted directly).
export function useGenerateContract() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const queryClient = useQueryClient();
  const logDownload = useLogDownload();
  return useMutation({
    mutationFn: async ({ lead, template, contractRequestId, isWalkIn, amountPaidOverride, acresOverride, legalOverride }: GenerateContractInput) => {
      if (!config) throw new Error('Config not loaded yet');
      if (!profile) throw new Error('Not signed in');

      if (template) {
        const fieldValues = resolveContractFields(lead, config, amountPaidOverride, acresOverride);
        const resolvedContent = resolveSections(template.content, fieldValues);
        const missing = findUnresolvedTokens(resolvedContent);
        if (missing.length > 0) {
          // CONTRACT_OF_SALE_BLUEPRINT.md §9 capability 4 -- carries the
          // real missing-key list on the error itself so the UI can hand
          // it straight to the AI checklist drafter without re-deriving
          // it (the deterministic message below is already useful and
          // shown instantly; the AI phrasing is a progressive add-on).
          throw Object.assign(new Error(`Can't generate yet -- missing: ${missing.join(', ')}. Fill these in (KYC details or config) and try again.`), { missingKeys: missing });
        }
        const styleSettings = await getDataSource(demoMode).contractStyleSettings.get();
        let templateCover: string | null = null;
        try {
          templateCover = config.contractCoverImage || (await loadImageAsDataUri('/contract-cover.jpg'));
        } catch {
          // Missing cover image shouldn't stop the contract from generating.
        }
        const doc = buildContractFromSections(template.templateName, resolvedContent, styleSettings, templateCover);
        const templateDocFilename = contractFilename(lead.name);
        doc.save(templateDocFilename);
        logDownload(templateDocFilename, 'pdf', doc.output('datauristring'));
        const ds = getDataSource(demoMode);
        const pdfBlob = doc.output('blob') as Blob;
        const storagePath = isWalkIn
          ? `walk-in/${profile.key}/${crypto.randomUUID()}.pdf`
          : `${lead.id}/${template.templateVersionId}-${Date.now()}.pdf`;
        const uploadedPath = await ds.contractGenerations.uploadPdf(storagePath, pdfBlob);
        await ds.contractGenerations.create({
          contractRequestId: contractRequestId ?? null,
          leadId: isWalkIn ? null : lead.id,
          clientName: lead.name,
          templateId: template.templateId,
          templateVersionId: template.templateVersionId,
          versionNumberSnapshot: template.versionNumber,
          contentSnapshot: resolvedContent,
          fieldValuesSnapshot: fieldValues,
          pdfStoragePath: uploadedPath,
          generatedBy: profile.key,
          generatedByName: profile.name,
        });
        // Existing contracts/contract_requests fulfil logic runs
        // unchanged (§8 step 4) -- the metadata-only row still gets
        // recorded so anything already reading contracts.list() (the
        // "Previously generated" list, fulfil status) keeps working.
        // Skipped for a walk-in: contracts.lead_id is a real, non-null
        // column with no FK to relax the way contract_generations' was --
        // there is no real lead.id to honestly record there, and the
        // Vault (reading contract_generations directly) already shows
        // every walk-in generation without this metadata-only row.
        if (isWalkIn) return null;
        return ds.contracts.create(lead.id, lead.name, lead.agent, profile.key, profile.name);
      }

      const standardLead = isWalkIn ? { ...lead, amtPaid: amountPaidOverride ?? 0 } : lead;
      const standardConfig = legalOverride ? { ...config, ...legalOverride } : config;
      const doc = await prepareStandardContractPdf(standardLead, standardConfig, acresOverride);
      const legacyDocFilename = contractFilename(lead.name);
      if (isWalkIn) {
        const ds = getDataSource(demoMode);
        const storagePath = `walk-in/${profile.key}/${crypto.randomUUID()}.pdf`;
        const uploadedPath = await ds.contractGenerations.uploadPdf(storagePath, doc.output('blob') as Blob);
        await ds.contractGenerations.create({
          contractRequestId: null,
          leadId: null,
          clientName: lead.name,
          templateId: null,
          templateVersionId: null,
          versionNumberSnapshot: null,
          contentSnapshot: [],
          fieldValuesSnapshot: resolveContractFields(standardLead, standardConfig, amountPaidOverride, acresOverride),
          pdfStoragePath: uploadedPath,
          generatedBy: profile.key,
          generatedByName: profile.name,
        });
        doc.save(legacyDocFilename);
        logDownload(legacyDocFilename, 'pdf', doc.output('datauristring'));
        return null;
      }
      const ds = getDataSource(demoMode);
      const uploadedPath = await ds.contractGenerations.uploadPdf(`${lead.id}/standard-${crypto.randomUUID()}.pdf`, doc.output('blob') as Blob);
      await ds.contractGenerations.create({
        contractRequestId: contractRequestId ?? null,
        leadId: lead.id,
        clientName: lead.name,
        templateId: null,
        templateVersionId: null,
        versionNumberSnapshot: null,
        contentSnapshot: [],
        fieldValuesSnapshot: resolveContractFields(standardLead, standardConfig, amountPaidOverride, acresOverride),
        pdfStoragePath: uploadedPath,
        generatedBy: profile.key,
        generatedByName: profile.name,
      });
      doc.save(legacyDocFilename);
      logDownload(legacyDocFilename, 'pdf', doc.output('datauristring'));
      return ds.contracts.create(lead.id, lead.name, lead.agent, profile.key, profile.name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contractGenerations'] });
    },
  });
}

