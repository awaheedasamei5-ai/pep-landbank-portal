import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Real RLS (downloads_sel, confirmed live) already scopes this correctly
// per session -- a manager gets everyone's rows, everyone else only
// their own -- so this needs no client-side filtering in either mode
// (demo mode's own log() only ever writes the current profile's rows in
// the first place, matching the same effective scope).
export function useDocumentVault() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ['documentVault', demoMode, profile?.key],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).downloads.list(profile?.key ?? '', profile?.role ?? 'agent'),
  });
}
