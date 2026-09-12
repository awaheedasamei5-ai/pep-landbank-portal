"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { useConfig } from '../../manager/hooks/useConfigSettings';
import { fmtLongDate } from '../../site-visit-auth/lib/siteVisitAuthLogic';
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

// User ask: "a section for site visit records for each staff, very
// detailed." Company-wide (real site_visits_sel RLS already scopes this
// to manager/ops.view_all, same fact useWeekSiteVisits already relies
// on) -- SiteVisitsScreen uses this instead of useSiteVisits() when a
// manager picks "All staff" or a specific staff member.
export function useAllSiteVisits() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['siteVisitsAll'], queryFn: () => getDataSource(demoMode).siteVisits.listAll() });
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

// Confirmation SMS to the client -- real user ask: "the sms should also
// state the pickup location that was filled and the time", not just a
// generic "we'll confirm shortly" (v1's own message, index.html:3738,
// never actually included either). Also notifies Management in-app + SMS
// (Master Spec 9.3 -- "staff" here is the agent submitting the form
// themselves, who already sees their own confirmation screen). Real
// production v1 (`lrahgcnftetnyxunaljs`) has no manager-role profile with
// a phone at all -- Management's real number lives on `app_config.
// company_phone` instead (confirmed live, 0544330390) -- so that's
// included alongside any manager-role profile phone, deduped, rather
// than assuming a profile row is the only place a number can live.
export function useCreateSiteVisit() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const { data: config } = useConfig();
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewSiteVisit) => {
      const ds = getDataSource(demoMode);
      const rec = await ds.siteVisits.create(agentKey, agentName, input);
      if (input.contact) {
        const whenPart = `${fmtLongDate(rec.visitDate)}${rec.visitTime ? ' (' + rec.visitTime + ')' : ''}`;
        const pickupPart = rec.pickup ? ` We'll pick you up at ${rec.pickup}.` : '';
        ds.sms
          .send(
            input.contact,
            `Hi ${input.name || ''}, your site visit request to Royal Palm Enclave has been received for ${whenPart}.${pickupPart} We'll confirm shortly. - PEP Landbank`,
            'site_visit_requested',
            agentKey || null
          )
          .catch(() => {});
      }
      const managers = await ds.staff.list().catch(() => []);
      const toManagers = managers.filter((m) => m.role === 'manager' && m.key !== agentKey);
      if (toManagers.length > 0) {
        const body = `${agentName} logged a site visit for ${rec.name} on ${rec.visitDate}${rec.visitTime ? ' (' + rec.visitTime + ')' : ''}.`;
        ds.notifications.notify(agentKey, agentName, toManagers.map((m) => m.key), body, 'site_visit_logged', 'site_visit', rec.id).catch(() => {});
        const phones = new Set(toManagers.map((m) => m.phone).filter((p): p is string => !!p));
        if (config?.companyPhone) phones.add(config.companyPhone);
        for (const phone of phones) ds.sms.send(phone, body, 'site_visit_logged', agentKey).catch(() => {});
      } else if (config?.companyPhone) {
        const body = `${agentName} logged a site visit for ${rec.name} on ${rec.visitDate}${rec.visitTime ? ' (' + rec.visitTime + ')' : ''}.`;
        ds.sms.send(config.companyPhone, body, 'site_visit_logged', agentKey).catch(() => {});
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
//
// Real gap fixed 2026-09-06: cancelling a visit here (Site Visit
// Authorization, usually Management acting on someone else's logged
// visit) never told the staff member who actually logged it -- they'd
// only find out by noticing the visit missing from their own list, with
// no idea why or by whom. Same in-app-notify + best-effort-SMS pattern
// every other cross-staff state change in this app already uses.
export function useCancelSiteVisit() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const ds = getDataSource(demoMode);
      const updated = await ds.siteVisits.cancel(id, reason, profile?.key ?? '', profile?.name ?? '');
      if (updated.agentKey && updated.agentKey !== profile?.key) {
        const body = `${profile?.name || 'A manager'} cancelled the site visit for ${updated.name} on ${fmtLongDate(updated.visitDate)}. Reason: ${reason}`;
        ds.notifications.notify(profile?.key ?? '', profile?.name ?? '', [updated.agentKey], body, 'site_visit_cancelled', 'site_visit', updated.id).catch(() => {});
        ds.staff
          .list()
          .then((staff) => {
            const phone = staff.find((s) => s.key === updated.agentKey)?.phone;
            if (phone) ds.sms.send(phone, body, 'site_visit_cancelled', profile?.key ?? null).catch(() => {});
          })
          .catch(() => {});
      }
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siteVisits'] });
      queryClient.invalidateQueries({ queryKey: ['weekSiteVisits'] });
      queryClient.invalidateQueries({ queryKey: ['siteVisitsForLead'] });
    },
  });
}

// Real user ask (2026-09-12): Site Visit Authorization's delete icon
// should offer "Remove completely" (cancel, above) or "Reschedule" --
// moving the same visit to a new date/time instead of cancelling it.
// Notifies whoever logged it (same pattern as cancel above) so a
// staff member finds out their client's visit moved, not just that it
// vanished from today's list. site_visits.lead_id already ties this
// row to Pipeline/Company Leads/Client Database's own per-lead Site
// Visits section (SiteVisitsSection in PipelineDetailScreen.tsx), so
// the "Rescheduled" tag + new date show up there automatically once
// the row itself is updated -- no separate write needed.
export function useRescheduleSiteVisit() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, newDate, newTime }: { id: string; newDate: string; newTime: string | null }) => {
      const ds = getDataSource(demoMode);
      const updated = await ds.siteVisits.reschedule(id, newDate, newTime, profile?.key ?? '', profile?.name ?? '');
      if (updated.agentKey && updated.agentKey !== profile?.key) {
        const body = `${profile?.name || 'A manager'} rescheduled the site visit for ${updated.name} to ${fmtLongDate(updated.visitDate)}${updated.visitTime ? ' (' + updated.visitTime + ')' : ''}.`;
        ds.notifications.notify(profile?.key ?? '', profile?.name ?? '', [updated.agentKey], body, 'site_visit_rescheduled', 'site_visit', updated.id).catch(() => {});
        ds.staff
          .list()
          .then((staff) => {
            const phone = staff.find((s) => s.key === updated.agentKey)?.phone;
            if (phone) ds.sms.send(phone, body, 'site_visit_rescheduled', profile?.key ?? null).catch(() => {});
          })
          .catch(() => {});
      }
      return updated;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['siteVisits'] });
      queryClient.invalidateQueries({ queryKey: ['weekSiteVisits'] });
      queryClient.invalidateQueries({ queryKey: ['siteVisitsForLead'] });
      if (updated.leadId) queryClient.invalidateQueries({ queryKey: ['siteVisitsForLead', updated.leadId] });
    },
  });
}