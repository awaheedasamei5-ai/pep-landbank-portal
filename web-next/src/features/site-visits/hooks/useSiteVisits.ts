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

// Confirmation SMS to the client on request -- matches index.html's own
// apiSendSms call right after the insert (index.html:3738), fire-and-forget.
export function useCreateSiteVisit() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const agentName = profile?.name ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewSiteVisit) => {
      const rec = await getDataSource(demoMode).siteVisits.create(agentKey, agentName, input);
      if (input.contact) {
        getDataSource(demoMode)
          .sms.send(input.contact, `Hi ${input.name || ''}, your site visit request to Royal Palm Enclave has been received. We'll confirm the date/time shortly. - PEP Landbank`, 'site_visit_requested', agentKey || null)
          .catch(() => {});
      }
      return rec;
    },
    onSuccess: (rec) => {
      queryClient.invalidateQueries({ queryKey: ['siteVisits', agentKey] });
      if (rec.leadId) queryClient.invalidateQueries({ queryKey: ['siteVisitsForLead', rec.leadId] });
    },
  });
}
