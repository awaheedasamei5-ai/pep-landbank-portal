import { Outlet, useLocation } from 'react-router';
import { BottomNav } from '../shared/ui/BottomNav';
import { OfflineBanner } from '../shared/ui/OfflineBanner';
import { useChatRealtime } from '../features/chat/hooks/useChat';
import { useDashboardRealtime } from '../features/dashboard/hooks/useDashboardRealtime';

// Authenticated shell -- 5-tab bottom nav + routed content, replaces the
// single monolithic route() dispatcher's chrome (index.html's #app wrapper).
// useChatRealtime() is mounted here (not inside ChatScreen) so
// conversation badges stay live app-wide, matching index.html's
// ensureChatSubscribed() being called globally after login. A chat
// thread (/app/chat/:otherKey, as opposed to the bare /app/chat list)
// hides the bottom nav -- it wants the full viewport height for message
// scrolling, matching index.html's own `.chat-fullscreen` toggle rather
// than fighting two independent fixed-bottom elements.
export function AppShell() {
  useChatRealtime();
  useDashboardRealtime();
  const location = useLocation();
  const isChatThread = /^\/app\/chat\/.+/.test(location.pathname);
  return (
    <div>
      <OfflineBanner />
      <Outlet />
      {!isChatThread && <BottomNav />}
    </div>
  );
}
