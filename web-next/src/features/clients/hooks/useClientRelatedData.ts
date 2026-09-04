import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { AllocationRequest, Complaint, Contract, ContractRequest, Payment, SiteVisit } from '../../../types/domain';

export interface ClientRelatedData {
  payments: Payment[];
  siteVisits: SiteVisit[];
  allocations: AllocationRequest[];
  contractRequests: ContractRequest[];
  complaints: Complaint[];
  contracts: Contract[];
}

// Master Rebuild Spec 17.2: "Open customer -> all related leads, payments,
// visits, allocations, contracts and complaints." Every fetch here uses the
// same agent-scoped call the rest of the app already relies on -- payments/
// siteVisits/complaints via listForAgent(agentKey), allocations/
// contractRequests via list(viewerKey, role) -- so this screen can never
// leak a colleague's record just because the app now surfaces more of it
// (Section 11's own "never reuse a generic all-X query for a personal
// screen" warning). ds.contracts.list() has no agent-scoped variant at all
// (confirmed in data/source.ts), so it's fetched broad and the caller MUST
// filter it down to the client's own leadIds before rendering -- never
// render this array directly.
export function useClientRelatedData() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const role = profile?.role ?? 'agent';

  return useQuery({
    queryKey: ['clientRelatedData', agentKey],
    enabled: !!agentKey,
    queryFn: async (): Promise<ClientRelatedData> => {
      const ds = getDataSource(demoMode);
      const [payments, siteVisits, allocations, contractRequests, complaints, contracts] = await Promise.all([
        ds.payments.listForAgent(agentKey),
        ds.siteVisits.listForAgent(agentKey),
        ds.allocationRequests.list(agentKey, role),
        ds.contractRequests.list(agentKey, role),
        ds.complaints.listForAgent(agentKey),
        ds.contracts.list(),
      ]);
      return { payments, siteVisits, allocations, contractRequests, complaints, contracts };
    },
  });
}
