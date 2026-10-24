import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { useLogDownload } from '../../../shared/hooks/useLogDownload';
import { buildContractOfSalePdf, contractFilename } from '../lib/contractPdf';
import { buildContractFromSections } from '../lib/contractSectionsPdf';
import { resolveContractFields, resolveSections, findUnresolvedTokens } from '../lib/contractFieldResolver';
import type { ContractSection, Lead } from '../../../types/domain';

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
  // Omitted/undefined => the original v1-parity hardcoded-text path below,
  // preserved byte-for-byte (nothing that already works is being touched).
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
  // no real lead.id to record. Only valid with `template` set: the
  // walk-in path has no v1-parity legacy-document fallback, since that
  // path's own contracts.create() needs a real, non-null lead_id and
  // has no FK to relax the way contract_generations.lead_id did.
  isWalkIn?: boolean;
  // Overrides resolveContractFields' default (lead.amtPaid) -- the real
  // fix for "let us enter the amount already paid before generating",
  // used both for a walk-in's typed-in figure and for re-stating an
  // existing lead's current real amount at generation time.
  amountPaidOverride?: number;
};

// Builds the branded PDF and downloads it. Without a template, this is the
// original v1-parity path: buildContractOfSalePdf() regenerates the exact
// same flat-Config-text document fresh every time (metadata-only record,
// no blob stored) -- unchanged, per §8 step 4 ("existing contracts/
// contract_requests fulfil logic runs unchanged").
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
    mutationFn: async ({ lead, template, contractRequestId, isWalkIn, amountPaidOverride }: GenerateContractInput) => {
      if (!config) throw new Error('Config not loaded yet');
      if (!profile) throw new Error('Not signed in');

      if (template) {
        const fieldValues = resolveContractFields(lead, config, amountPaidOverride);
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
        const storagePath = `${isWalkIn ? 'walk-in' : lead.id}/${template.templateVersionId}-${Date.now()}.pdf`;
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

      let cover: string | null = null;
      let wordmark: string | null = null;
      try {
        cover = config.contractCoverImage || (await loadImageAsDataUri('/contract-cover.jpg'));
      } catch {
        // Missing cover image shouldn't stop the contract from generating.
      }
      try {
        wordmark = config.contractWordmarkImage || (await loadImageAsDataUri('/trulander-wordmark.png'));
      } catch {
        // Missing wordmark shouldn't stop the contract from generating.
      }
      const doc = buildContractOfSalePdf(lead, config, cover, wordmark);
      const legacyDocFilename = contractFilename(lead.name);
      doc.save(legacyDocFilename);
      logDownload(legacyDocFilename, 'pdf', doc.output('datauristring'));
      return getDataSource(demoMode).contracts.create(lead.id, lead.name, lead.agent, profile.key, profile.name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contractGenerations'] });
    },
  });
}
