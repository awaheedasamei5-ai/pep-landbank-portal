"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { EnquiryUpdate, NewEnquiry } from '../../../types/domain';

// Real user ask (2026-09-05): "enquiries/complaints are supposed to reach
// the person theyre assigned to and management." Management sees every
// enquiry live (matching Complaints' own manager/agent split), an agent
// sees enquiries they logged OR were escalated to via `owner`.
export function useEnquiries() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const isManager = profile?.role === 'manager';
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['enquiries', isManager ? 'all' : agentKey],
    enabled: !!agentKey,
    queryFn: () => (isManager ? getDataSource(demoMode).enquiries.listAll() : getDataSource(demoMode).enquiries.listForAgent(agentKey)),
  });
}

export function useCreateEnquiry() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewEnquiry) => getDataSource(demoMode).enquiries.create(agentKey, agentName, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enquiries'] });
    },
  });
}

// Same real notify-on-reassign as Complaints (useComplaints.ts) -- an
// enquiry escalated to a colleague now actually reaches them, not just
// silently updates a column.
export function useUpdateEnquiry() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch, previousOwner, enquiryName }: { id: string; patch: EnquiryUpdate; previousOwner: string | null; enquiryName: string | null }) => {
      const ds = getDataSource(demoMode);
      const updated = await ds.enquiries.update(id, patch);
      if (patch.owner && patch.owner !== previousOwner && patch.owner !== profile?.key) {
        const staff = await ds.staff.list().catch(() => []);
        const target = staff.find((s) => s.key === patch.owner);
        if (target) {
          const body = `${profile?.name ?? 'A colleague'} assigned you an enquiry${enquiryName ? ` from ${enquiryName}` : ''} to handle. Review it in Palmstead.`;
          ds.notifications.notify(profile?.key ?? '', profile?.name ?? '', [target.key], body, 'enquiry_assigned', 'enquiry', id).catch(() => {});
          if (target.phone) ds.sms.send(target.phone, body, 'enquiry_assigned', profile?.key ?? null).catch(() => {});
        }
      }
      return updated;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enquiries'] }),
  });
}