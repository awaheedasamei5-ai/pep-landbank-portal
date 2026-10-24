"use client";

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
// visits, allocations, contracts and complaints." Staff fetch their own
// payments; Management fetches company-visible payments under the existing
// payments RLS policy. The client detail screen filters every result to this
// customer's lead IDs before rendering. Contracts have no agent-scoped
// variant, so the caller must apply that same client filter to them too.
export function useClientRelatedData() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const role = profile?.role ?? 'agent';

  return useQuery({
    queryKey: ['clientRelatedData', agentKey, role],
    enabled: !!agentKey,
    queryFn: async (): Promise<ClientRelatedData> => {
      const ds = getDataSource(demoMode);
      const [payments, siteVisits, allocations, contractRequests, complaints, contracts] = await Promise.all([
        role === 'manager' ? ds.payments.listAll() : ds.payments.listForAgent(agentKey),
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