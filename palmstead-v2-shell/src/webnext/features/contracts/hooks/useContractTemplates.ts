import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { ContractTemplateVersionStatus, NewContractTemplate, ContractSection, ContractGeneration } from '../../../types/domain';

// CONTRACT_OF_SALE_BLUEPRINT.md §6 -- same manager-or-elizabeth gate as
// useCanFulfilContracts() (this whole feature area's established access
// boundary), reused rather than inventing a second permission concept.
export function useContractTemplates() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['contractTemplates'], queryFn: () => getDataSource(demoMode).contractTemplates.list() });
}

export function useCreateContractTemplate() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewContractTemplate) => getDataSource(demoMode).contractTemplates.create(profile?.key ?? '', profile?.name ?? 'Management', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractTemplates'] }),
  });
}

export function useContractTemplateVersions(templateId: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['contractTemplateVersions', templateId],
    enabled: !!templateId,
    queryFn: () => getDataSource(demoMode).contractTemplateVersions.listForTemplate(templateId),
  });
}

// CONTRACT_OF_SALE_BLUEPRINT.md §8 -- feeds the generator's template
// picker; a manager may only ever generate from a published version.
export function usePublishedContractTemplateVersions() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['contractTemplateVersions', 'published'], queryFn: () => getDataSource(demoMode).contractTemplateVersions.listPublished() });
}

export function useCreateContractTemplateVersion() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, versionNumber }: { templateId: string; versionNumber: number }) =>
      getDataSource(demoMode).contractTemplateVersions.create(templateId, versionNumber, profile?.key ?? '', profile?.name ?? 'Management'),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contractTemplateVersions', vars.templateId] });
      queryClient.invalidateQueries({ queryKey: ['contractTemplates'] });
    },
  });
}

export function useUpdateContractTemplateVersion() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { content?: ContractSection[]; status?: ContractTemplateVersionStatus } }) => getDataSource(demoMode).contractTemplateVersions.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractTemplateVersions'] }),
  });
}

export function usePublishContractTemplateVersion() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).contractTemplateVersions.publish(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractTemplateVersions'] });
      queryClient.invalidateQueries({ queryKey: ['contractTemplates'] });
    },
  });
}

export function useContractClauses() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['contractClauses'], queryFn: () => getDataSource(demoMode).contractClauses.list() });
}

export function useCreateContractClause() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; category?: string; body: string }) => getDataSource(demoMode).contractClauses.create(profile?.key ?? '', profile?.name ?? 'Management', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractClauses'] }),
  });
}

export function useUpdateContractClause() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<{ name: string; category: string | null; body: string; isActive: boolean }> }) =>
      getDataSource(demoMode).contractClauses.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractClauses'] }),
  });
}

export function useContractFields() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['contractFields'], queryFn: () => getDataSource(demoMode).contractFields.list() });
}

export function useCreateContractField() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, scope, templateId }: { key: string; scope: 'common' | 'template'; templateId: string | null }) =>
      getDataSource(demoMode).contractFields.create(profile?.key ?? '', key, scope, templateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractFields'] }),
  });
}

// CONTRACT_OF_SALE_BLUEPRINT.md §5 -- feeds the staff-facing progress rail
// (a generation existing for a lead is the real "Draft"/"Downloaded"
// signal; RLS already scopes list() to manager/elizabeth or the lead's
// own agent, matching who's allowed to see a request's rail at all).
export function useContractGenerations() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['contractGenerations'], queryFn: () => getDataSource(demoMode).contractGenerations.list() });
}

// docs/plans/41-complete-system-findings-and-phased-fix-plan.md Phase 7,
// C2.5 -- the legacy `contracts` table (the v1-parity path's own
// metadata-only record, no stored PDF) and `contract_generations` (the
// v3 template path's content-bearing snapshot) are two real, separate
// tables for the same real-world event. useContracts()/useContractReports
// already correctly read both (Reports' own production-count math has
// always used `contracts.length` as the true total) -- the Vault screen
// was the one place still reading `contract_generations` alone, making
// every legacy-path contract invisible in "every contract ever issued."
// This merges both into the one shape ContractVaultScreen already
// renders, without migrating or mutating a single legacy row: a legacy
// contract gets templateId/pdfStoragePath = null, which the screen's
// existing "Legacy" badge and "No stored PDF" empty-state already handle
// correctly (re-download isn't offered for these, matching the real
// v1-parity path's own behaviour of never storing a blob -- regenerating
// one is Pipeline's own "Generate & send to client" action, not this
// screen's job).
export function useAllContractsForVault() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const generationsQuery = useContractGenerations();
  const contractsQuery = useQuery({ queryKey: ['contracts'], queryFn: () => getDataSource(demoMode).contracts.list() });

  const generations = generationsQuery.data ?? [];
  const legacyAsGenerations: ContractGeneration[] = (contractsQuery.data ?? []).map((c) => ({
    id: c.id,
    contractRequestId: null,
    leadId: c.leadId,
    clientName: c.clientName,
    templateId: null,
    templateVersionId: null,
    versionNumberSnapshot: null,
    contentSnapshot: [],
    fieldValuesSnapshot: {},
    pdfStoragePath: null,
    generatedBy: c.createdBy,
    generatedByName: c.createdByName,
    generatedAt: c.createdAt,
  }));

  // A template-based generation already writes BOTH tables (useGenerateContract),
  // so the same real event would otherwise appear twice -- dedupe by leadId never
  // mattering here since contract_generations rows always sort first and a legacy
  // row only gets kept if no generation shares its exact clientName+day, the
  // cheapest real signal available without a shared id linking the two tables.
  const generationKeys = new Set(generations.map((g) => `${g.clientName}|${g.generatedAt.slice(0, 10)}`));
  const dedupedLegacy = legacyAsGenerations.filter((l) => !generationKeys.has(`${l.clientName}|${l.generatedAt.slice(0, 10)}`));

  const merged = [...generations, ...dedupedLegacy].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

  return {
    data: merged,
    isLoading: generationsQuery.isLoading || contractsQuery.isLoading,
  };
}

export function useContractApprovals(templateVersionId: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['contractApprovals', templateVersionId],
    enabled: !!templateVersionId,
    queryFn: () => getDataSource(demoMode).contractApprovals.listForVersion(templateVersionId),
  });
}

export function useDecideContractApproval() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateVersionId, status, reason }: { templateVersionId: string; status: 'approved' | 'rejected'; reason: string | null }) =>
      getDataSource(demoMode).contractApprovals.decide(templateVersionId, status, reason, profile?.key ?? '', profile?.name ?? 'Management'),
    onSuccess: (_data, vars) => queryClient.invalidateQueries({ queryKey: ['contractApprovals', vars.templateVersionId] }),
  });
}
