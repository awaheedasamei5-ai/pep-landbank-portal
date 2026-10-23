import { useMutation, useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../../data/client';
import { missingKycFieldLabels } from '../lib/contractFieldResolver';
import type { Lead } from '../../../types/domain';

// CONTRACT_OF_SALE_BLUEPRINT.md §9 -- the 4 named AI capabilities, all
// through the shared ai-insights function's new contract_* kinds.
// Deterministic-verdict/AI-drafts-language throughout, matching every
// other AI capability built this session: a real check/diff already
// decided the facts below, the model only phrases them -- it's never
// given room to invent what's missing or what changed.

// 1. KYC completeness checker -- the missing-field list itself is the
// real deterministic verdict (exactly the fields the contract resolver
// actually needs, per ContractFieldKey); AI only drafts the one-line
// summary shown in the KYC modal.
export function useKycCompletenessSummary(lead: Lead | null) {
  const missing = lead ? missingKycFieldLabels(lead) : [];
  return useQuery({
    queryKey: ['contractKycCompleteness', lead?.id, missing.join(',')],
    enabled: !!lead && missing.length > 0,
    staleTime: 1000 * 60 * 10,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !lead) return null;
      const { data, error } = await client.functions.invoke('ai-insights', {
        body: { kind: 'contract_kyc_completeness', context: { firstName: lead.name.split(' ')[0] || lead.name, missingFields: missing } },
      });
      if (error) return null;
      const message = (data as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}

// 2. Plain-language clause explainer -- an explicit "Explain this clause"
// tap, not something that auto-fires for every section on a page.
export function useClauseExplainer() {
  return useMutation({
    mutationFn: async (clauseText: string) => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', { body: { kind: 'contract_clause_explainer', context: { clauseText } } });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? null;
    },
  });
}

export interface ContractFieldChange {
  label: string;
  oldValue: string;
  newValue: string;
}

// 3. Consistency scan -- the real diff (which fields changed, and their
// old/new values, compared against the field_values_snapshot of this
// lead's own last real generation) is computed deterministically by the
// caller; this only drafts the explanation sentence once a real change
// list exists, auto-fetched the same way useKycCompletenessSummary is
// (not a manual tap -- Management should see the flag the moment they
// select a lead with real drift, not have to ask for it).
export function useConsistencyScanSummary(leadId: string | undefined, changes: ContractFieldChange[]) {
  return useQuery({
    queryKey: ['contractConsistencyScan', leadId, changes.map((c) => `${c.label}:${c.oldValue}>${c.newValue}`).join('|')],
    enabled: !!leadId && changes.length > 0,
    staleTime: 1000 * 60 * 10,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', { body: { kind: 'contract_consistency_scan', context: { changes } } });
      if (error) return null;
      const message = (data as { message?: string } | null)?.message;
      return message && message.length > 0 ? message : null;
    },
  });
}

// 4. Missing-data checklist -- findUnresolvedTokens() (contractFieldResolver.ts)
// is the real deterministic guard already blocking generation; this only
// drafts a friendlier phrasing of the same real list, shown alongside the
// raw list rather than replacing it.
export function useMissingDataChecklistDraft() {
  return useMutation({
    mutationFn: async (missingKeys: string[]) => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client.functions.invoke('ai-insights', { body: { kind: 'contract_missing_data_checklist', context: { missingKeys } } });
      if (error) throw error;
      return (data as { message?: string } | null)?.message ?? null;
    },
  });
}
