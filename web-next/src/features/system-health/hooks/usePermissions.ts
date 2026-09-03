import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

// Port of the permission-record model built this session (staging only --
// see PHASE0_INVENTORY.md §4): a manager-only grant/revoke matrix over the
// real permissions catalog and staff roster. grant()/clear() call the two
// audit-logged RPCs (set_permission_override/clear_permission_override in
// live mode); nothing here writes to role_permissions (role-wide defaults
// stay a database-side concern, no UI for it yet).
export function usePermissions() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  const enabled = !!profile && profile.role === 'manager';

  const defsQuery = useQuery({
    queryKey: ['permissionDefs', demoMode],
    enabled,
    queryFn: () => getDataSource(demoMode).permissions.listDefs(),
  });
  const overridesQuery = useQuery({
    queryKey: ['permissionOverrides', demoMode],
    enabled,
    queryFn: () => getDataSource(demoMode).permissions.listOverrides(),
  });
  const staffQuery = useQuery({
    queryKey: ['staffListAll', demoMode],
    enabled,
    queryFn: () => getDataSource(demoMode).staff.listAll(),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['permissionOverrides', demoMode] });
    queryClient.invalidateQueries({ queryKey: ['auditLog', demoMode] });
    queryClient.invalidateQueries({ queryKey: ['systemHealthAudit', demoMode] });
  }

  const grant = useMutation({
    mutationFn: ({ staffKey, permissionKey }: { staffKey: string; permissionKey: string }) => getDataSource(demoMode).permissions.grant(staffKey, permissionKey, profile?.key ?? ''),
    onSuccess: invalidate,
  });
  const clear = useMutation({
    mutationFn: ({ staffKey, permissionKey }: { staffKey: string; permissionKey: string }) => getDataSource(demoMode).permissions.clear(staffKey, permissionKey),
    onSuccess: invalidate,
  });

  const staff = (staffQuery.data ?? []).filter((s) => s.role !== 'manager');
  const overrides = overridesQuery.data ?? [];

  function isGranted(staffKey: string, permissionKey: string): boolean {
    return overrides.some((o) => o.staffKey === staffKey && o.permissionKey === permissionKey && o.granted);
  }

  function toggle(staffKey: string, permissionKey: string) {
    if (isGranted(staffKey, permissionKey)) clear.mutate({ staffKey, permissionKey });
    else grant.mutate({ staffKey, permissionKey });
  }

  return {
    isLoading: defsQuery.isLoading || overridesQuery.isLoading || staffQuery.isLoading,
    defs: defsQuery.data ?? [],
    staff,
    isGranted,
    toggle,
    isPending: grant.isPending || clear.isPending,
  };
}
