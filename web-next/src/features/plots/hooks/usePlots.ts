import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewPlot, PlotUpdate } from '../../../types/domain';

export function usePlots() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);

  return useQuery({
    queryKey: ['plots'],
    // Real RLS restricts this to manager + elias/emmanuel -- gate the
    // query itself, not just the UI, so an ungated agent never even fires
    // a request that RLS would silently empty-out anyway.
    enabled: !!profile && (profile.role === 'manager' || profile.key === 'elias' || profile.key === 'emmanuel'),
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
