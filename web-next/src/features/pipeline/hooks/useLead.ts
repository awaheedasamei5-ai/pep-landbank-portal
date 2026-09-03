import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { LeadUpdate } from '../../../types/domain';

// Real bug found while testing the payment-receipt feature: leads.get()
// is agent-scoped (both demo and live), so a manager opening a lead from
// Manager Home's stage/agent drill-down or Company Pipeline -- which
// correctly show every agent's leads -- got "Lead not found" the moment
// they actually clicked in, since the lookup was always keyed to the
// viewer's own agentKey, not the lead's real owner. Same fix pattern
// already used for useAllLeadsForLinking/useManagerPipeline: staff with
// company-wide visibility fetch via listAll() and find by id instead.
export function useLead(id: string) {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const viewAll = !!profile && (profile.role === 'manager' || ['elias', 'emmanuel', 'elizabeth'].includes(profile.key));

  return useQuery({
    queryKey: ['lead', agentKey, id, viewAll],
    enabled: !!agentKey && !!id,
    queryFn: async () => {
      // React Query disallows a queryFn resolving to undefined (logs
      // "Query data cannot be undefined") -- surfaced for real by the
      // leads soft-delete fix: deleting a lead now correctly makes it
      // vanish from a subsequent refetch instead of erroring, and this
      // screen's own `if (!lead) return <div>Lead not found.</div>` guard
      // needs a real null, not undefined, to satisfy that contract.
      const ds = getDataSource(demoMode);
      if (viewAll) {
        const all = await ds.leads.listAll();
        return all.find((l) => l.id === id) ?? null;
      }
      return (await ds.leads.get(agentKey, id)) ?? null;
    },
  });
}

// Real gate on the accompanying "Documentation & allocation" accordion
// section (canViewClientDatabase() in index.html) -- manager or elias/
// emmanuel/elizabeth only, same allowlist update_lead_doc_stage's RPC
// itself enforces server-side.
export function useCanViewDocStage(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return !!profile && (profile.role === 'manager' || ['elias', 'emmanuel', 'elizabeth'].includes(profile.key));
}

export function useUpdateLead() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LeadUpdate }) => getDataSource(demoMode).leads.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useUpdateLeadDocStage() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => getDataSource(demoMode).leads.updateDocStage(id, stage),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead'] }),
  });
}

export function useDeleteLead() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).leads.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
