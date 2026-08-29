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
import { LogPaymentScreen } from '../features/payments/screens/LogPaymentScreen';
import { ComplaintsScreen } from '../features/complaints/screens/ComplaintsScreen';
import { AddComplaintScreen } from '../features/complaints/screens/AddComplaintScreen';
import { LeaderboardScreen } from '../features/manager/screens/LeaderboardScreen';
import { CommissionScreen } from '../features/manager/screens/CommissionScreen';
import { MyCommissionScreen } from '../features/commission/screens/MyCommissionScreen';
import { ContractRequestsScreen } from '../features/contracts/screens/ContractRequestsScreen';
import { CompanyLeadsScreen } from '../features/company-leads/screens/CompanyLeadsScreen';
import { SettingsScreen } from '../features/manager/screens/SettingsScreen';
import { TeamRosterScreen } from '../features/manager/screens/TeamRosterScreen';
import { ReportsScreen } from '../features/manager/screens/ReportsScreen';
import { QuotationScreen } from '../features/quotation/screens/QuotationScreen';
import { LeaveScreen } from '../features/leave/screens/LeaveScreen';
import { AllocationRequestsScreen } from '../features/allocations/screens/AllocationRequestsScreen';

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
        path: 'mgr/leaderboard',
        element: (
          <RequireRole role="manager">
            <LeaderboardScreen />
          </RequireRole>
        ),
      },
      {
        path: 'mgr/commission',
        element: (
          <RequireRole role="manager">
            <CommissionScreen />
          </RequireRole>
        ),
      },
      {
        path: 'mgr/settings',
        element: (
          <RequireRole role="manager">
            <SettingsScreen />
          </RequireRole>
        ),
      },
      {
        path: 'mgr/team',
        element: (
          <RequireRole role="manager">
            <TeamRosterScreen />
          </RequireRole>
        ),
      },
      {
        path: 'mgr/reports',
        element: (
          <RequireRole role="manager">
            <ReportsScreen />
          </RequireRole>
        ),
      },
      { path: 'commission', element: <MyCommissionScreen /> },
      {
        // Sales/Office Desk and everything under them are shared staff
        // tools, not per-role dashboards -- unlike 'home'/'mgr' (two
        // genuinely different screens by design), a manager needs to open
        // these too (Log Payment's approvals are manager-primary). Coarse
        // gate is just "authenticated"; finer per-screen restrictions
        // (Plot Inventory, SVE management, Log Payment, etc.) already
        // live inside each screen component. Fixed 2026-08-29: these were
        // all wrongly wrapped in RequireRole role="agent" until now, which
        // silently made this entire tree unreachable for any manager --
        // caught while wiring Log Payment, which a manager must be able
        // to open to approve/decline pending payments.
        path: 'sales',
        element: <SalesDeskScreen />,
      },
      { path: 'sales/pipeline', element: <PipelineListScreen /> },
      { path: 'sales/pipeline/new', element: <AddLeadScreen /> },
      { path: 'sales/pipeline/:id', element: <PipelineDetailScreen /> },
      { path: 'sales/plots', element: <PlotInventoryScreen /> },
      { path: 'sales/clients', element: <ClientDatabaseScreen /> },
      { path: 'sales/sitevisits', element: <SiteVisitsScreen /> },
      { path: 'sales/sitevisits/new', element: <AddSiteVisitScreen /> },
      { path: 'sales/sitevisits/experience', element: <SveManagementScreen /> },
      { path: 'sales/referrals', element: <ReferralsScreen /> },
      { path: 'sales/referrals/new', element: <AddReferralScreen /> },
      { path: 'sales/enquiries', element: <EnquiriesScreen /> },
      { path: 'sales/enquiries/new', element: <AddEnquiryScreen /> },
      { path: 'sales/complaints', element: <ComplaintsScreen /> },
      { path: 'sales/company-leads', element: <CompanyLeadsScreen /> },
      { path: 'sales/allocations', element: <AllocationRequestsScreen /> },
      { path: 'sales/complaints/new', element: <AddComplaintScreen /> },
      { path: 'office', element: <OfficeDeskScreen /> },
      { path: 'office/myday', element: <MyDayScreen /> },
      { path: 'office/attendance', element: <AttendanceScreen /> },
      { path: 'office/memos', element: <MemosScreen /> },
      { path: 'office/memos/new', element: <ComposeMemoScreen /> },
      // Finer manager/'elias'-only restriction lives in LogPaymentScreen
      // itself (useCanLogPayments), matching real payments_ins RLS.
      { path: 'office/payments', element: <LogPaymentScreen /> },
      { path: 'office/contracts', element: <ContractRequestsScreen /> },
      { path: 'office/quotation', element: <QuotationScreen /> },
      { path: 'office/leave', element: <LeaveScreen /> },
      { path: 'chat', element: <ChatScreen /> },
      { path: 'chat/:otherKey', element: <ChatThreadScreen /> },
      { path: 'more', element: <MoreScreen /> },
    ],
  },
]);
