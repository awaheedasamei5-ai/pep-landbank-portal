import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { ComplaintUpdate, NewComplaint } from '../../../types/domain';

export function useComplaints() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';

  return useQuery({
    queryKey: ['complaints', agentKey],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).complaints.listForAgent(agentKey),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['complaints', agentKey] }),
  });
}

export function useUpdateComplaint() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ComplaintUpdate }) => getDataSource(demoMode).complaints.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['complaints', agentKey] }),
  });
}
