import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import type { NewOfficeLocation } from '../../../types/domain';

// Real V3 chapter-01 entity -- see project-attendance-v3-chapter01-gap
// memory. Readable by any authenticated staff member (AttendanceScreen's
// off-site check needs this too, not just the Management admin screen),
// writes are manager-only at the RLS layer.
export function useOfficeLocations() {
  const demoMode = useSessionStore((s) => s.demoMode);
  return useQuery({ queryKey: ['officeLocations', demoMode], queryFn: () => getDataSource(demoMode).officeLocations.list() });
}

export function useCreateOfficeLocation() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewOfficeLocation) => getDataSource(demoMode).officeLocations.create(profile?.key ?? '', profile?.name ?? '', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['officeLocations'] }),
  });
}

export function useUpdateOfficeLocation() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<NewOfficeLocation & { isActive: boolean }> }) => getDataSource(demoMode).officeLocations.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['officeLocations'] }),
  });
}

export function useDeleteOfficeLocation() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).officeLocations.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['officeLocations'] }),
  });
}
