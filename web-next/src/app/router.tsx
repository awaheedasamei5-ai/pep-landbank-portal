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
import { ClientDatabaseScreen } from '../features/clients/screens/ClientDatabaseScreen';
import { SiteVisitsScreen } from '../features/site-visits/screens/SiteVisitsScreen';
import { AddSiteVisitScreen } from '../features/site-visits/screens/AddSiteVisitScreen';
import { ReferralsScreen } from '../features/referrals/screens/ReferralsScreen';
import { AddReferralScreen } from '../features/referrals/screens/AddReferralScreen';
import { EnquiriesScreen } from '../features/enquiries/screens/EnquiriesScreen';
import { AddEnquiryScreen } from '../features/enquiries/screens/AddEnquiryScreen';
import { AttendanceScreen } from '../features/attendance/screens/AttendanceScreen';
import { MemosScreen } from '../features/memos/screens/MemosScreen';
import { ComposeMemoScreen } from '../features/memos/screens/ComposeMemoScreen';
import { MoreScreen } from '../features/more/screens/MoreScreen';
import { SveFeedbackScreen } from '../features/public/sve/SveFeedbackScreen';
import { SveManagementScreen } from '../features/sve-management/screens/SveManagementScreen';
import { ChatScreen } from '../features/chat/screens/ChatScreen';
import { ChatThreadScreen } from '../features/chat/screens/ChatThreadScreen';

// Two disjoint trees: the authenticated /app/* tree (RequireAuth-wrapped)
// and a small public tree (/visit-feedback/:token -- the Site Visit
// Experience form, no session at all). base:'./' in vite.config.ts means
// the eventual cutover basename gets set here once decided.
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginScreen /> },
  // Public, unauthenticated -- no RequireAuth wrapper. See the
  // SiteVisitInvite type's comment in types/domain.ts.
  { path: '/visit-feedback/:token', element: <SveFeedbackScreen /> },
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
        path: 'sales/clients',
        element: (
          <RequireRole role="agent">
            <ClientDatabaseScreen />
          </RequireRole>
        ),
      },
      {
        path: 'sales/sitevisits',
        element: (
          <RequireRole role="agent">
            <SiteVisitsScreen />
          </RequireRole>
        ),
      },
      {
        path: 'sales/sitevisits/new',
        element: (
          <RequireRole role="agent">
            <AddSiteVisitScreen />
          </RequireRole>
        ),
      },
      {
        // Coarse role gate matches every other Sales Desk route; the
        // finer manager/elias/emmanuel/elizabeth-only restriction lives
        // in SveManagementScreen itself, same pattern as Plot Inventory.
        path: 'sales/sitevisits/experience',
        element: (
          <RequireRole role="agent">
            <SveManagementScreen />
          </RequireRole>
        ),
      },
      {
        path: 'sales/referrals',
        element: (
          <RequireRole role="agent">
            <ReferralsScreen />
          </RequireRole>
        ),
      },
      {
        path: 'sales/referrals/new',
        element: (
          <RequireRole role="agent">
            <AddReferralScreen />
          </RequireRole>
        ),
      },
      {
        path: 'sales/enquiries',
        element: (
          <RequireRole role="agent">
            <EnquiriesScreen />
          </RequireRole>
        ),
      },
      {
        path: 'sales/enquiries/new',
        element: (
          <RequireRole role="agent">
            <AddEnquiryScreen />
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
      {
        path: 'office/attendance',
        element: (
          <RequireRole role="agent">
            <AttendanceScreen />
          </RequireRole>
        ),
      },
      {
        path: 'office/memos',
        element: (
          <RequireRole role="agent">
            <MemosScreen />
          </RequireRole>
        ),
      },
      {
        path: 'office/memos/new',
        element: (
          <RequireRole role="agent">
            <ComposeMemoScreen />
          </RequireRole>
        ),
      },
      { path: 'chat', element: <ChatScreen /> },
      { path: 'chat/:otherKey', element: <ChatThreadScreen /> },
      { path: 'more', element: <MoreScreen /> },
    ],
  },
]);
