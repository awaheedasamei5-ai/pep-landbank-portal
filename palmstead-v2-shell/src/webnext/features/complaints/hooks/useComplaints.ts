"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { ComplaintUpdate, NewComplaint } from '../../../types/domain';

// Real user ask (2026-09-05): "enquiries/complaints are supposed to reach
// the person theyre assigned to and management." Management sees every
// complaint live (matching Task Board's own manager/agent split), an
// agent sees complaints they logged OR were escalated to via `owner`
// (see data/source.ts's listForAgent -- fixed the same day: `owner` used
// to be pure free text with no query path back to whoever it named).
export function useComplaints() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = profile?.role === 'manager';
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['complaints', isManager ? 'all' : agentKey],
    enabled: !!agentKey,
    queryFn: () => (isManager ? getDataSource(demoMode).complaints.listAll() : getDataSource(demoMode).complaints.listForAgent(agentKey)),
  });
}

// Confirmation SMS to the client on submission -- matches index.html's own
// apiSendSms call right after the insert (index.html:3722), fire-and-forget.
export function useCreateComplaint() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewComplaint) => {
      const rec = await getDataSource(demoMode).complaints.create(agentKey, agentName, input);
      if (input.contact) {
        getDataSource(demoMode)
          .sms.send(input.contact, `Hi ${input.name || ''}, we've received your feedback and someone from our team will follow up with you soon. - PEP Landbank`, 'complaint_submitted', agentKey || null)
          .catch(() => {});
      }
      return rec;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['complaints'] }),
  });
}

// Real user ask (2026-09-05): "escalated to another staff... someone
// needs to know what's going on" -- reassigning `owner` used to just
// silently update a text column. Now it actually reaches the new owner
// the same in-app-notify + best-effort-SMS way every other cross-staff
// handoff in this app already uses (meeting invites, site-visit
// cancellation, allocation requests).
export function useUpdateComplaint() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch, previousOwner, complaintName }: { id: string; patch: ComplaintUpdate; previousOwner: string | null; complaintName: string | null }) => {
      const ds = getDataSource(demoMode);
      const updated = await ds.complaints.update(id, patch);
      if (patch.owner && patch.owner !== previousOwner && patch.owner !== profile?.key) {
        const staff = await ds.staff.list().catch(() => []);
        const target = staff.find((s) => s.key === patch.owner);
        if (target) {
          const body = `${profile?.name ?? 'A colleague'} assigned you a complaint${complaintName ? ` from ${complaintName}` : ''} to handle. Review it in Palmstead.`;
          ds.notifications.notify(profile?.key ?? '', profile?.name ?? '', [target.key], body, 'complaint_assigned', 'complaint', id).catch(() => {});
          if (target.phone) ds.sms.send(target.phone, body, 'complaint_assigned', profile?.key ?? null).catch(() => {});
        }
      }
      return updated;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['complaints'] }),
  });
}

// Real user ask: "complains apps, we would be able to delete logged data
// from our apps and it effects at the other ends of the system in real
// time." A genuine hard delete (complaints_del RLS already permits it,
// agent-scoped or manager) -- propagates live to every other open
// session via useDashboardRealtime's existing complaints subscription.
export function useDeleteComplaint() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).complaints.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['complaints'] }),
  });
}