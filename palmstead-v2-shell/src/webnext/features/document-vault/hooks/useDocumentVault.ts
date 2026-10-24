import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// docs/plans/20-document-vault-plan.md -- real RLS (downloads_sel,
// confirmed live) already scopes this correctly per session: a manager
// gets everyone's rows, everyone else only their own -- so this needs
// no client-side filtering.
export function useDocumentVault() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ['documentVault', demoMode, profile?.key],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).downloads.list(profile?.key ?? '', profile?.role ?? 'agent'),
  });
}
