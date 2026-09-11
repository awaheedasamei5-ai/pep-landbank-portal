import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { ContractTemplateVersionStatus, NewContractTemplate, ContractSection } from '../../../types/domain';

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
