"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { weekEndIso } from '../lib/siteVisitAuthLogic';
import type { WeeklyVisitFormCostPatch } from '../../../types/domain';

// Real user ask (2026-09-11): "give all staff ... full access to the
// site visit authorization app." Was manager + elias/emmanuel/elizabeth
// only (a leftover pilot scope) -- opened to any signed-in staff member,
// matching the matching real wvf_staff_sel/upd RLS opened the same way.
// Finalize & approve stays a separate, genuine manager-only business
// action (gated directly in SiteVisitAuthScreen's own isManager check),
// not an access-tier restriction.
export function useCanViewSiteVisitAuth(): boolean {
  const profile = useSessionStore((s) => s.profile);
  return !!profile;
}

export function useWeeklyVisitForm(weekStart: string, visitDate: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({
    queryKey: ['weeklyVisitForm', weekStart, visitDate],
    queryFn: () => getDataSource(demoMode).weeklyVisitForms.getOrCreate(weekStart, visitDate),
  });
}

// Real site visits for the full week (Monday through Sunday). Fixed
// 2026-09-03: used to stop at Friday (matching legacy's own
// apiLoadSiteVisitsForWeek), a real pre-existing bug that hid Sunday's
// visits even under the old Tue/Wed/Fri/Sun schedule -- see weekEndIso's
// own comment. Filtered client-side from the same unfiltered listAll()
// Company Leads/Reports already rely on, real site_visits_sel RLS already
// scopes this correctly per viewer.
export function useWeekSiteVisits(weekStart: string) {
  const demoMode = useSessionStore((s) => s.demoMode);
  const weekEnd = weekEndIso(weekStart);
  return useQuery({
    queryKey: ['weekSiteVisits', weekStart],
    queryFn: async () => {
      const all = await getDataSource(demoMode).siteVisits.listAll();
      return all.filter((v) => v.visitDate >= weekStart && v.visitDate <= weekEnd);
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
