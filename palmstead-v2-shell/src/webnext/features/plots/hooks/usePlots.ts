"use client";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewPlot, PlotUpdate } from '../../../types/domain';

export function usePlots() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);

  return useQuery({
    queryKey: ['plots'],
    // Real user ask (2026-09-11): "give the rest of the staff who are not
    // in charge of allocations view only access to the plot inventory."
    // This gate used to match plots_sel's old manager/elias/emmanuel-only
    // RLS -- left unchanged when that RLS was widened, it silently zeroed
    // out every KPI and tile for every other staff member (query never
    // even fired) even though the screen itself already treats everyone
    // as having view access. Real plots_sel now matches: any signed-in
    // staff member; plots_ins/upd/del stay manager/elias/emmanuel-only.
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).plots.list(),
  });
}

export function useCreatePlot() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewPlot) => getDataSource(demoMode).plots.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plots'] }),
  });
}

export function useUpdatePlot() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PlotUpdate }) => getDataSource(demoMode).plots.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plots'] }),
  });
}

export function useDeletePlot() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).plots.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plots'] }),
  });
}

export function useSplitPlot() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plotId: string) => getDataSource(demoMode).plots.split(plotId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plots'] }),
  });
}