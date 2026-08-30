import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { weekFridayIso } from '../lib/siteVisitAuthLogic';
import type { WeeklyVisitFormCostPatch } from '../../../types/domain';

// Real UI gate (canViewClientDatabase in index.html) -- manager or elias/
// emmanuel/elizabeth, matching wvf_staff_sel/ins/upd RLS exactly (confirmed
// live).
export function useCanViewSiteVisitAuth(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return !!profile && (profile.role === 'manager' || ['elias', 'emmanuel', 'elizabeth'].includes(profile.key));
}

export function useWeeklyVisitForm(weekStart: string, visitDate: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['weeklyVisitForm', weekStart, visitDate],
    queryFn: () => getDataSource(demoMode).weeklyVisitForms.getOrCreate(weekStart, visitDate),
  });
}

// Real site visits for the week (Mon-Fri window, matching
// apiLoadSiteVisitsForWeek exactly) -- filtered client-side from the same
// unfiltered listAll() Company Leads/Reports already rely on, real
// site_visits_sel RLS already scopes this correctly per viewer.
export function useWeekSiteVisits(weekStart: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const friday = weekFridayIso(weekStart);
  return useQuery({
    queryKey: ['weekSiteVisits', weekStart],
    queryFn: async () => {
      const all = await getDataSource(demoMode).siteVisits.listAll();
      return all.filter((v) => v.visitDate >= weekStart && v.visitDate <= friday);
    },
  });
}

export function useSaveWeeklyVisitCosts() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WeeklyVisitFormCostPatch }) => getDataSource(demoMode).weeklyVisitForms.saveCosts(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weeklyVisitForm'] }),
  });
}

export function useFinalizeWeeklyVisitForm() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).weeklyVisitForms.finalize(id, profile?.key ?? '', profile?.name ?? '', profile?.signatureData ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weeklyVisitForm'] }),
  });
}
