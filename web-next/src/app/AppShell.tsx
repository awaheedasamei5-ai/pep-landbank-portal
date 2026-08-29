import { Outlet } from 'react-router';
import { BottomNav } from '../shared/ui/BottomNav';

// Authenticated shell -- 5-tab bottom nav + routed content, replaces the
// single monolithic route() dispatcher's chrome (index.html's #app wrapper).
export function AppShell() {
  return (
    <div>
      <Outlet />
      <BottomNav />
    </div>
  );
}
