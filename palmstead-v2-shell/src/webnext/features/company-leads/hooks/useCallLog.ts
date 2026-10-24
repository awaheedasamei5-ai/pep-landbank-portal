"use client";

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useCompanyLeads } from './useCompanyLeads';

// docs/plans/28-company-leads-engagement-upgrade-plan.md Phase 1 -- the
// real Call Log, scoped to Company Leads specifically. activityLog.
// listCompanyWide() itself is generic shared infra (every lead's
// activity, any owner) -- real bug caught live before shipping: without
// this filter, the page silently showed every staff member's own
// pipeline activity too, not just Company Leads' real client pool.
// Filtering here, against the already-real company-lead id set
// (useCompanyLeads(), the exact same source CompanyLeadsScreen itself
// reads), keeps the generic activityLog method honestly generic while
// this page only shows what it claims to.
export function useCompanyWideActivity() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: companyLeads } = useCompanyLeads();
  const allActivity = useQuery({ queryKey: ['companyWideActivity'], queryFn: () => getDataSource(demoMode).activityLog.listCompanyWide() });

  const companyLeadIds = useMemo(() => new Set((companyLeads ?? []).map((l) => l.id)), [companyLeads]);
  const data = useMemo(() => (allActivity.data ?? []).filter((e) => e.leadId && companyLeadIds.has(e.leadId)), [allActivity.data, companyLeadIds]);

  return { data, isLoading: allActivity.isLoading || !companyLeads };
}

export interface LogCallInput {
  leadId: string;
  client: string;
  action: string;
  outcome: string | null;
  method: string | null;
  note: string | null;
  follow: string | null;
}

export function useLogCall() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LogCallInput) => {
      if (!profile) throw new Error('Not signed in');
      return getDataSource(demoMode).activityLog.logCall({
        agentKey: profile.key,
        agentName: profile.name,
        client: input.client,
        leadId: input.leadId,
        action: input.action,
        outcome: input.outcome,
        method: input.method,
        note: input.note,
        follow: input.follow,
      });
    },
    onSuccess: (_row, input) => {
      queryClient.invalidateQueries({ queryKey: ['companyWideActivity'] });
      queryClient.invalidateQueries({ queryKey: ['activityForLead', input.leadId] });
    },
  });
}
