"use client";

import { useQuery } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { AllocationRequest, Complaint, Contract, ContractGeneration, ContractRequest, Payment, SiteVisit } from '../../../types/domain';

export interface ClientRelatedData {
  payments: Payment[];
  siteVisits: SiteVisit[];
  allocations: AllocationRequest[];
  contractRequests: ContractRequest[];
  complaints: Complaint[];
  contracts: Contract[];
  contractGenerations: ContractGeneration[];
}

// Master Rebuild Spec 17.2: "Open customer -> all related leads, payments,
// visits, allocations, contracts and complaints." Fetch payments by this
// customer's lead IDs. The database's payments RLS policy still controls which
// rows the current role can read, while the lead filter avoids an extra,
// viewer-agent filter that can hide a staff member's own client's payments.
// Contracts have no agent-scoped variant, so the caller applies the same
// client filter to them before rendering.
export function useClientRelatedData(leadIds: string[] = []) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const role = profile?.role ?? 'agent';
  const clientLeadIds = [...new Set(leadIds)].sort();

  return useQuery({
    queryKey: ['clientRelatedData', agentKey, role, clientLeadIds],
    enabled: !!agentKey,
    queryFn: async (): Promise<ClientRelatedData> => {
      const ds = getDataSource(demoMode);
      const [paymentsByLead, siteVisits, allocations, contractRequests, complaints, contracts, contractGenerations] = await Promise.all([
        Promise.all(clientLeadIds.map((leadId) => ds.payments.listForLead(leadId))),
        role === 'manager' ? ds.siteVisits.listAll() : ds.siteVisits.listForAgent(agentKey),
        ds.allocationRequests.list(agentKey, role),
        ds.contractRequests.list(agentKey, role),
        ds.complaints.listForAgent(agentKey),
        ds.contracts.list(),
        ds.contractGenerations.list(),
      ]);
      return { payments: paymentsByLead.flat(), siteVisits, allocations, contractRequests, complaints, contracts, contractGenerations };
    },
  });
}