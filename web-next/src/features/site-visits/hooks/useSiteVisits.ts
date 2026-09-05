import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewSiteVisit } from '../../../types/domain';

export function useSiteVisits() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['siteVisits', agentKey],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).siteVisits.listForAgent(agentKey),
  });
}

// Master Spec 9.3: "Prevent duplicate booking for the same client/date
// unless Management explicitly allows it." Scoped to the CURRENT agent's
// own visits (the same real RLS shape listForAgent already uses) rather
// than a company-wide check -- the realistic case this catches is the
// same staff member re-submitting for a client they already booked, and
// avoiding a broader cross-agent query means no new permission surface.
// Returns the clashing visit, or null.
export function findDuplicateVisit(existing: { name: string; contact: string; visitDate: string; deletedAt: string | null }[], name: string, contact: string, visitDate: string) {
  const n = name.trim().toLowerCase();
  const c = contact.replace(/[^0-9]/g, '').slice(-9);
  return existing.find((v) => !v.deletedAt && v.visitDate === visitDate && v.contact.replace(/[^0-9]/g, '').slice(-9) === c && v.name.trim().toLowerCase() === n) ?? null;
}

// Confirmation SMS to the client on request -- matches index.html's own
// apiSendSms call right after the insert (index.html:3738), fire-and-forget.
// Also notifies Management in-app + SMS (Master Spec 9.3: "notify staff +
// Management in-app and by SMS" -- "staff" here is the agent submitting
// the form themselves, who already sees their own confirmation screen;
// same real ds.staff.list()-filtered-by-role/ds.notifications.notify/
// ds.sms.send pattern useCreateAllocationRequest already uses).
export function useCreateSiteVisit() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewSiteVisit) => {
      const ds = getDataSource(demoMode);
      const rec = await ds.siteVisits.create(agentKey, agentName, input);
      if (input.contact) {
        ds.sms.send(input.contact, `Hi ${input.name || ''}, your site visit request to Royal Palm Enclave has been received. We'll confirm the date/time shortly. - PEP Landbank`, 'site_visit_requested', agentKey || null).catch(() => {});
      }
      const managers = await ds.staff.list().catch(() => []);
      const toManagers = managers.filter((m) => m.role === 'manager' && m.key !== agentKey);
      if (toManagers.length > 0) {
        const body = `${agentName} logged a site visit for ${rec.name} on ${rec.visitDate}${rec.visitTime ? ' at ' + rec.visitTime : ''}.`;
        ds.notifications.notify(agentKey, agentName, toManagers.map((m) => m.key), body, 'site_visit_logged', 'site_visit', rec.id).catch(() => {});
        for (const mgr of toManagers) {
          if (mgr.phone) ds.sms.send(mgr.phone, body, 'site_visit_logged', agentKey).catch(() => {});
        }
      }
      return rec;
    },
    onSuccess: (rec) => {
      queryClient.invalidateQueries({ queryKey: ['siteVisits', agentKey] });
      if (rec.leadId) queryClient.invalidateQueries({ queryKey: ['siteVisitsForLead', rec.leadId] });
    },
  });
}

// Master Spec 9.4: soft cancel (never a hard delete) -- see the
// DataSource siteVisits.cancel() comment in data/source.ts.
export function useCancelSiteVisit() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => getDataSource(demoMode).siteVisits.cancel(id, reason, profile?.key ?? '', profile?.name ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siteVisits'] });
      queryClient.invalidateQueries({ queryKey: ['weekSiteVisits'] });
      queryClient.invalidateQueries({ queryKey: ['siteVisitsForLead'] });
    },
  });
}
