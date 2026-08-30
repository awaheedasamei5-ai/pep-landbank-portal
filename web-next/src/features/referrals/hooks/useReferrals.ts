import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewReferral } from '../../../types/domain';

// Same manager/elias/emmanuel/elizabeth allowlist clear_referral() itself
// enforces server-side (SECURITY DEFINER check inside the function) --
// mirrored here so the UI only offers the clear/link actions to staff who
// could actually succeed, not as the real authorization boundary.
export function useCanClearReferrals(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return !!profile && (profile.role === 'manager' || ['elias', 'emmanuel', 'elizabeth'].includes(profile.key));
}

export function useReferrals() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const viewAll = !!profile && (profile.role === 'manager' || ['elias', 'emmanuel', 'elizabeth'].includes(profile.key));

  return useQuery({
    queryKey: ['referrals', agentKey, viewAll],
    enabled: !!agentKey,
    queryFn: () => getDataSource(demoMode).referrals.listForAgent(agentKey, viewAll),
  });
}

export function useLinkReferralLead() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, leadId }: { id: string; leadId: string }) => getDataSource(demoMode).referrals.linkLead(id, leadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['referrals'] }),
  });
}

export function useClearReferral() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, points }: { id: string; points: number }) => getDataSource(demoMode).referrals.clear(id, points),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      // A cleared referral awards points to the referrer -- the
      // Leaderboard's agentPoints() reads from real data each time, not a
      // cache, but invalidate anyway so a manager who just cleared one and
      // flips to Leaderboard doesn't see a stale number for one extra fetch.
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });
}

export function useCreateReferral() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const agentKey = profile?.key ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: NewReferral) => getDataSource(demoMode).referrals.create(agentKey, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals', agentKey] });
    },
  });
}
