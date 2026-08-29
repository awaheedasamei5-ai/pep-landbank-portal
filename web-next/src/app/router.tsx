import { createBrowserRouter, Navigate } from 'react-router';
import { LoginScreen } from '../auth/LoginScreen';
import { RequireAuth, RequireRole } from '../auth/RequireRole';
import { AppShell } from './AppShell';
import { HomeScreen } from '../features/home/screens/HomeScreen';
import { MgrHomeScreen } from '../features/manager/screens/MgrHomeScreen';
import { StubScreen } from '../shared/ui/StubScreen';

// Phase 1: two disjoint trees exist in spirit (public vs authenticated) --
// only the authenticated /app/* tree is built out; the public SVE-form/
// widget routes are deferred to a later phase. base:'./' in vite.config.ts
// means the eventual cutover basename gets set here once decided.
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginScreen /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="home" replace /> },
      {
        path: 'home',
        element: (
          <RequireRole role="agent">
            <HomeScreen />
          </RequireRole>
        ),
      },
      {
        path: 'mgr',
        element: (
          <RequireRole role="manager">
            <MgrHomeScreen />
          </RequireRole>
        ),
      },
      { path: 'sales', element: <StubScreen title="Sales Desk" /> },
      { path: 'office', element: <StubScreen title="Office Desk" /> },
      { path: 'chat', element: <StubScreen title="Chat" /> },
      { path: 'more', element: <StubScreen title="More" /> },
    ],
  },
]);
