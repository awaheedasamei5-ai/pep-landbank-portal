import { useMutation } from '@tanstack/react-query';
import { getDataSource } from '../../../data/source';
import { useSessionStore } from '../../../auth/useSessionStore';
import { getPushSupportState, subscribeWebPush, type PushSupportState } from '../../../shared/lib/webPush';

export type { PushSupportState };
export { getPushSupportState };

// Demo mode has no real push infra to subscribe to (no service worker
// receiving a demo push, no push_subscriptions row that would ever be
// used) -- the mutation still runs the real browser permission/subscribe
// flow (so the UI genuinely demonstrates the prompt), it just skips the
// save-to-backend step in that branch.
export function useEnablePushNotifications() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      const sub = await subscribeWebPush();
      if (!demoMode) {
        await getDataSource(demoMode).pushSubscriptions.save('staff', profile.key, sub);
      }
      return sub;
    },
  });
}
