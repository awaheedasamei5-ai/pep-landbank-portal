import { Outlet, useLocation } from 'react-router';
import { BottomNav } from '../shared/ui/BottomNav';
import { Sidebar } from '../shared/ui/Sidebar';
import { OfflineBanner } from '../shared/ui/OfflineBanner';
import { useChatRealtime } from '../features/chat/hooks/useChat';
import { useDashboardRealtime } from '../features/dashboard/hooks/useDashboardRealtime';
import styles from './AppShell.module.css';

// Authenticated shell. Mobile keeps the original 5-tab bottom nav +
// routed content unchanged. Desktop (>=1024px) additionally renders a
// persistent left Sidebar in a flex row -- Premium UI Rebuild spec,
// Section 16's own acceptance criterion: "Desktop has a real workspace
// layout with persistent navigation and no unnecessary bottom-nav
// dominance." Sidebar itself is display:none below the breakpoint, and
// .content's max-width/centering (see module.css) only activates once
// the sidebar is actually taking space, so mobile rendering is
// byte-for-byte the same layout as before this. useChatRealtime() is
// mounted here (not inside ChatScreen) so conversation badges stay live
// app-wide, matching index.html's ensureChatSubscribed() being called
// globally after login. A chat thread (/app/chat/:otherKey, as opposed
// to the bare /app/chat list) hides the bottom nav -- it wants the full
// viewport height for message scrolling, matching index.html's own
// `.chat-fullscreen` toggle rather than fighting two independent
// fixed-bottom elements.
export function AppShell() {
  useChatRealtime();
  useDashboardRealtime();
  const location = useLocation();
  const isChatThread = /^\/app\/chat\/.+/.test(location.pathname);
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <OfflineBanner />
        <div className={styles.content}>
          <Outlet />
        </div>
        {!isChatThread && <BottomNav />}
      </div>
    </div>
  );
}
