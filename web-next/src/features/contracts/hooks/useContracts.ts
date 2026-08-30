import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { loadImageAsDataUri } from '../../../shared/lib/image';
import { buildContractOfSalePdf, contractFilename } from '../lib/contractPdf';
import type { Lead } from '../../../types/domain';

export function useContracts() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ['contracts'],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).contracts.list(),
  });
}

// Builds the branded PDF, downloads it, then records the generation as
// metadata only (see the Contract type's own comment -- no blob stored,
// buildContractOfSalePdf() regenerates the exact same document fresh any
// time it's needed).
export function useGenerateContract() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const { data: config } = useConfig();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lead: Lead) => {
      if (!config) throw new Error('Config not loaded yet');
      if (!profile) throw new Error('Not signed in');
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
      doc.save(contractFilename(lead.name));
      return getDataSource(demoMode).contracts.create(lead.id, lead.name, lead.agent, profile.key, profile.name);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  });
}
