import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';

export function useNotifications() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const myKey = profile?.key ?? '';
  return useQuery({
    queryKey: ['notifications', myKey],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).notifications.list(myKey),
    refetchInterval: 60_000,
  });
}

// Sidebar's own badge -- a lightweight separate query (not derived from
// useNotifications' list) so a screen that only needs the count doesn't
// force every notification body to load too.
export function useUnreadNotificationCount() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const myKey = profile?.key ?? '';
  return useQuery({
    queryKey: ['notificationsUnreadCount', myKey],
    enabled: !!profile,
    queryFn: () => getDataSource(demoMode).notifications.unreadCount(myKey),
    refetchInterval: 60_000,
  });
}

function useInvalidateNotifications() {
  const profile = useSessionStore((s) => s.profile);
  const queryClient = useQueryClient();
  const myKey = profile?.key ?? '';
  return () => {
    queryClient.invalidateQueries({ queryKey: ['notifications', myKey] });
    queryClient.invalidateQueries({ queryKey: ['notificationsUnreadCount', myKey] });
  };
}

export function useMarkNotificationRead() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: string) => getDataSource(demoMode).notifications.markRead(id),
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const profile = useSessionStore((s) => s.profile);
  const demoMode = useSessionStore((s) => s.demoMode);
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: () => getDataSource(demoMode).notifications.markAllRead(profile?.key ?? ''),
    onSuccess: invalidate,
  });
}
