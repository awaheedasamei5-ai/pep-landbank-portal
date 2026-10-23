import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewContractDraft } from '../../../types/domain';

// Real table `contract_drafts` (docs/plans/16-contract-of-sale-build-plan.md
// §1.2) -- an in-progress contract saved before generation. RLS is owner
// (created_by) or manager/elizabeth, same shape as useContractRequests.
export function useContractDrafts() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ['contractDrafts'],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).contractDrafts.list(),
  });
}

export function useCreateContractDraft() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewContractDraft) => getDataSource(demoMode).contractDrafts.create(profile?.key ?? '', profile?.name ?? '', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractDrafts'] }),
  });
}

export function useUpdateContractDraft() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<NewContractDraft> }) => getDataSource(demoMode).contractDrafts.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractDrafts'] }),
  });
}

export function useDeleteContractDraft() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).contractDrafts.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractDrafts'] }),
  });
}
