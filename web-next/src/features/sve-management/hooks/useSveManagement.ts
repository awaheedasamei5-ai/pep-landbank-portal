import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

export function useSveVisits() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['sveVisits'], queryFn: () => getDataSource(demoMode).sve.listVisitsWithStatus() });
}

// Real gap closed here: createInvite() only ever wrote the invite row --
// nothing ever actually sent the client the link, so every "sent" invite
// was really unsent. Matches index.html's real message/link shape
// (index.html:15412-15416) -- location.origin/pathname + '?sve=' there is
// this app's own real public route, /visit-feedback/:token (router.tsx).
export function useSendSveInvite() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ siteVisitId, clientName, clientContact }: { siteVisitId: string; clientName: string; clientContact: string }) => {
      const invite = await getDataSource(demoMode).sve.createInvite(siteVisitId, clientName, clientContact, profile?.key ?? '');
      if (clientContact) {
        const link = `${window.location.origin}/visit-feedback/${invite.token}`;
        const firstName = clientName ? clientName.split(' ')[0] : 'there';
        const msg = `Hi ${firstName}, thank you for honoring our invitation for a site visit to Royal Palm Enclave! We'd love your feedback -- please share your experience here: ${link}`;
        getDataSource(demoMode)
          .sms.send(clientContact, msg, 'site_visit_experience_invite', profile?.key ?? null)
          .catch(() => {});
      }
      return invite;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sveVisits'] }),
  });
}
