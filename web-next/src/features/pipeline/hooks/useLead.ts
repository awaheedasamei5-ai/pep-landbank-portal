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

// Bulk-safe reassignment (My Pipeline's "Assign" bulk action, Master Spec
// Section 4.1) -- real leads.assign() RPC-free UPDATE, already existed
// for other call sites (Company Leads), just needed a hook wrapper here.
export function useAssignLead() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, agentKey }: { id: string; agentKey: string }) => getDataSource(demoMode).leads.assign(id, agentKey),
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

// Master Spec Section 4.5: the reason chosen in the danger-zone UI is now
// actually sent through and persisted, not discarded.
export function useDeleteLead() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => getDataSource(demoMode).leads.remove(id, reason, profile?.key ?? '', profile?.name ?? ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leadsArchived'] });
      qc.invalidateQueries({ queryKey: ['auditForLead'] });
    },
  });
}

// Manager-only view (real RLS -- see leads_sel's own comment).
export function useArchivedLeads() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ['leadsArchived'],
    enabled: profile?.role === 'manager',
    queryFn: () => getDataSource(demoMode).leads.listArchived(),
  });
}

export function useRestoreLead() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).leads.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leadsArchived'] });
    },
  });
}

// Master Spec Section 4's lead-record sections: Site Visits (real FK,
// see SiteVisit.leadId's own comment), a combined Activity timeline
// (real activity_log.lead_id FK), and a manager-only Audit trail (merges
// audit_events for the lead itself with events for its own payments --
// two queries, since RLS/entity_type doesn't let one request span both).
export function useSiteVisitsForLead(leadId: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['siteVisitsForLead', leadId], enabled: !!leadId, queryFn: () => getDataSource(demoMode).siteVisits.listForLead(leadId) });
}

export function useActivityForLead(leadId: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['activityForLead', leadId], enabled: !!leadId, queryFn: () => getDataSource(demoMode).activityLog.listForLead(leadId) });
}

// Master Spec Section 4's lifecycle-automation gap: a manual stage
// change (e.g. FollowUpSection's "Mark as Lost") previously left no
// trace anywhere -- fire-and-forget, matches useLogDownload's own
// never-block-the-caller contract, since a missed log entry is real but
// non-fatal, unlike a failed lead update itself.
export function useLogActivity() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const qc = useQueryClient();
  return (client: string, action: string, detail: string | null, leadId: string) => {
    if (!profile) return;
    getDataSource(demoMode)
      .activityLog.log(profile.key, profile.name, client, action, detail, leadId)
      .then(() => qc.invalidateQueries({ queryKey: ['activityForLead', leadId] }))
      .catch(() => {});
  };
}

export function useAuditForLead(leadId: string, paymentIds: string[]) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ['auditForLead', leadId, paymentIds.join(',')],
    enabled: !!leadId && profile?.role === 'manager',
    queryFn: async () => {
      const ds = getDataSource(demoMode);
      const [leadEvents, paymentEvents] = await Promise.all([
        ds.audit.list({ entityType: 'lead', entityIds: [leadId] }),
        paymentIds.length > 0 ? ds.audit.list({ entityType: 'payment', entityIds: paymentIds }) : Promise.resolve([]),
      ]);
      return [...leadEvents, ...paymentEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });
}
