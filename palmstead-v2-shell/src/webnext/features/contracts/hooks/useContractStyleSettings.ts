import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { ContractStyleSettingsPatch } from '../../../types/domain';

// Real table `contract_style_settings` (docs/plans/16-contract-of-sale-build-plan.md
// §1.2/§4) -- typography/branding config for the generated PDF.
export function useContractStyleSettings() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['contractStyleSettings'], queryFn: () => getDataSource(demoMode).contractStyleSettings.get() });
}

export function useUpdateContractStyleSettings() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ContractStyleSettingsPatch) => getDataSource(demoMode).contractStyleSettings.update(patch, profile?.key ?? '', profile?.name ?? 'Management'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractStyleSettings'] }),
  });
}
