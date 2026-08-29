import { createBrowserRouter, Navigate } from 'react-router';
import { LoginScreen } from '../auth/LoginScreen';
import { RequireAuth, RequireRole } from '../auth/RequireRole';
import { AppShell } from './AppShell';
import { HomeScreen } from '../features/home/screens/HomeScreen';
import { MgrHomeScreen } from '../features/manager/screens/MgrHomeScreen';
import { SalesDeskScreen } from '../features/sales-desk/screens/SalesDeskScreen';
import { PipelineListScreen } from '../features/pipeline/screens/PipelineListScreen';
import { AddLeadScreen } from '../features/pipeline/screens/AddLeadScreen';
import { PipelineDetailScreen } from '../features/pipeline/screens/PipelineDetailScreen';
import { OfficeDeskScreen } from '../features/office-desk/screens/OfficeDeskScreen';
import { MyDayScreen } from '../features/ops-tracker/screens/MyDayScreen';
import { PlotInventoryScreen } from '../features/plots/screens/PlotInventoryScreen';
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
      {
        path: 'sales',
        element: (
          <RequireRole role="agent">
            <SalesDeskScreen />
          </RequireRole>
        ),
      },
      {
        path: 'sales/pipeline',
        element: (
          <RequireRole role="agent">
            <PipelineListScreen />
          </RequireRole>
        ),
      },
      {
        path: 'sales/pipeline/new',
        element: (
          <RequireRole role="agent">
            <AddLeadScreen />
          </RequireRole>
        ),
      },
      {
        path: 'sales/pipeline/:id',
        element: (
          <RequireRole role="agent">
            <PipelineDetailScreen />
          </RequireRole>
        ),
      },
      {
        // Coarse role gate matches every other Sales Desk route; the finer
        // manager/elias/emmanuel-only restriction (mirroring real production
        // RLS on `plots`) lives in usePlots()'s `enabled` check, so a
        // different agent reaching this URL directly sees an empty,
        // permanently-loading-free screen rather than a route bounce.
        path: 'sales/plots',
        element: (
          <RequireRole role="agent">
            <PlotInventoryScreen />
          </RequireRole>
        ),
      },
      {
        path: 'office',
        element: (
          <RequireRole role="agent">
            <OfficeDeskScreen />
          </RequireRole>
        ),
      },
      {
        path: 'office/myday',
        element: (
          <RequireRole role="agent">
            <MyDayScreen />
          </RequireRole>
        ),
      },
      { path: 'chat', element: <StubScreen title="Chat" /> },
      { path: 'more', element: <StubScreen title="More" /> },
    ],
  },
]);
