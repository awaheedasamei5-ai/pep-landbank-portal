import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Every lead, every agent -- the same ds.leads.listAll() the Log Payment
// picker and Manager Home's pipeline drill-down already rely on under real
// RLS. A referred person only shows up here once they've actually become a
// real lead (started paying) -- linking a referral means finding that real
// record, not guessing at one.
export function useAllLeadsForLinking() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['allLeadsForLinking'], queryFn: () => getDataSource(demoMode).leads.listAll() });
}
