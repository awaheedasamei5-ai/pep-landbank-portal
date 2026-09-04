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
import { TaskBoardScreen } from '../features/ops-tracker/screens/TaskBoardScreen';
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
import { ReceiptDownloadScreen } from '../features/public/receipt/ReceiptDownloadScreen';
import { PublicStatsScreen } from '../features/public/stats/PublicStatsScreen';
import { SveManagementScreen } from '../features/sve-management/screens/SveManagementScreen';
import { ChatScreen } from '../features/chat/screens/ChatScreen';
import { ChatThreadScreen } from '../features/chat/screens/ChatThreadScreen';
import { LogPaymentScreen } from '../features/payments/screens/LogPaymentScreen';
import { ComplaintsScreen } from '../features/complaints/screens/ComplaintsScreen';
import { AddComplaintScreen } from '../features/complaints/screens/AddComplaintScreen';
import { LeaderboardScreen } from '../features/manager/screens/LeaderboardScreen';
import { ManagerPipelineScreen } from '../features/manager/screens/ManagerPipelineScreen';
import { CommissionScreen } from '../features/manager/screens/CommissionScreen';
import { MyCommissionScreen } from '../features/commission/screens/MyCommissionScreen';
import { ContractRequestsScreen } from '../features/contracts/screens/ContractRequestsScreen';
import { ContractGeneratorScreen } from '../features/contracts/screens/ContractGeneratorScreen';
import { CompanyLeadsScreen } from '../features/company-leads/screens/CompanyLeadsScreen';
import { SettingsScreen } from '../features/manager/screens/SettingsScreen';
import { TeamRosterScreen } from '../features/manager/screens/TeamRosterScreen';
import { ReportsScreen } from '../features/manager/screens/ReportsScreen';
import { QuotationScreen } from '../features/quotation/screens/QuotationScreen';
import { TechnicalQuotationScreen } from '../features/quotation/screens/TechnicalQuotationScreen';
import { LeaveScreen } from '../features/leave/screens/LeaveScreen';
import { AllocationRequestsScreen } from '../features/allocations/screens/AllocationRequestsScreen';
import { BannerTrackingScreen } from '../features/banners/screens/BannerTrackingScreen';
import { ExpensesScreen } from '../features/expenses/screens/ExpensesScreen';
import { SiteVisitAuthScreen } from '../features/site-visit-auth/screens/SiteVisitAuthScreen';
import { DataCheckScreen } from '../features/data-check/screens/DataCheckScreen';
import { AnalyticsScreen } from '../features/analytics/screens/AnalyticsScreen';
import { StaffReportScreen } from '../features/staff-report/screens/StaffReportScreen';
import { InsightsHubScreen } from '../features/manager/screens/InsightsHubScreen';
import { SmartInsightsScreen } from '../features/smart-insights/screens/SmartInsightsScreen';
import { InsightListScreen } from '../features/smart-insights/screens/InsightListScreen';
import { DocumentVaultScreen } from '../features/document-vault/screens/DocumentVaultScreen';
import { PortfolioScreen } from '../features/portfolio/screens/PortfolioScreen';
import { NotesScreen } from '../features/notes/screens/NotesScreen';
import { SystemHealthScreen } from '../features/system-health/screens/SystemHealthScreen';
import { AuditLogScreen } from '../features/system-health/screens/AuditLogScreen';
import { BackupsScreen } from '../features/system-health/screens/BackupsScreen';
import { PermissionsScreen } from '../features/system-health/screens/PermissionsScreen';

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
  // Public, unauthenticated -- the receipt link a client and their staff
  // member in charge both receive after a payment is approved. See
  // data/receiptClient.ts's comment for the get-receipt edge function
  // this talks to.
  { path: '/receipt/:token', element: <ReceiptDownloadScreen /> },
  // Public, unauthenticated -- Blueprint Phase 9's "Public stats widget".
  // /stats is the company-wide aggregate; /stats/:token is one staff
  // member's own personalized numbers (see PublicStatsScreen's comment).
  { path: '/stats', element: <PublicStatsScreen /> },
  { path: '/stats/:token', element: <PublicStatsScreen /> },
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
        path: 'mgr/pipeline',
        element: (
          <RequireRole role="manager">
            <ManagerPipelineScreen />
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
      {
        path: 'mgr/analytics',
        element: (
          <RequireRole role="manager">
            <AnalyticsScreen />
          </RequireRole>
        ),
      },
      {
        path: 'mgr/insights',
        element: (
          <RequireRole role="manager">
            <InsightsHubScreen />
          </RequireRole>
        ),
      },
      {
        path: 'mgr/health',
        element: (
          <RequireRole role="manager">
            <SystemHealthScreen />
          </RequireRole>
        ),
      },
      {
        path: 'mgr/health/audit',
        element: (
          <RequireRole role="manager">
            <AuditLogScreen />
          </RequireRole>
        ),
      },
      {
        path: 'mgr/health/backups',
        element: (
          <RequireRole role="manager">
            <BackupsScreen />
          </RequireRole>
        ),
      },
      {
        path: 'mgr/health/permissions',
        element: (
          <RequireRole role="manager">
            <PermissionsScreen />
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
      { path: 'office/tasks', element: <TaskBoardScreen /> },
      { path: 'office/attendance', element: <AttendanceScreen /> },
      { path: 'office/memos', element: <MemosScreen /> },
      { path: 'office/memos/new', element: <ComposeMemoScreen /> },
      // Finer manager/'elias'-only restriction lives in LogPaymentScreen
      // itself (useCanLogPayments), matching real payments_ins RLS.
      { path: 'office/payments', element: <LogPaymentScreen /> },
      { path: 'office/contracts', element: <ContractRequestsScreen /> },
      // Finer manager/'elizabeth'-only restriction lives in
      // ContractGeneratorScreen itself (useCanFulfilContracts), matching
      // real contracts_ins RLS.
      { path: 'office/contracts/generate', element: <ContractGeneratorScreen /> },
      { path: 'office/quotation', element: <QuotationScreen /> },
      { path: 'office/quotation/technical', element: <TechnicalQuotationScreen /> },
      { path: 'office/leave', element: <LeaveScreen /> },
      { path: 'office/notes', element: <NotesScreen /> },
      { path: 'office/banners', element: <BannerTrackingScreen /> },
      { path: 'office/expenses', element: <ExpensesScreen /> },
      { path: 'office/sitevisitauth', element: <SiteVisitAuthScreen /> },
      {
        path: 'office/staffreport',
        element: (
          <RequireRole role="manager">
            <StaffReportScreen />
          </RequireRole>
        ),
      },
      { path: 'chat', element: <ChatScreen /> },
      { path: 'chat/:otherKey', element: <ChatThreadScreen /> },
      { path: 'more', element: <MoreScreen /> },
      { path: 'data-check', element: <DataCheckScreen /> },
      { path: 'insights', element: <SmartInsightsScreen /> },
      { path: 'insights/:kind', element: <InsightListScreen /> },
      { path: 'vault', element: <DocumentVaultScreen /> },
      { path: 'portfolio', element: <PortfolioScreen /> },
    ],
  },
]);
