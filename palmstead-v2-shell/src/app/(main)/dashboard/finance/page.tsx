import { PageHeader } from "@/components/page-header";
import { TabsContent } from "@/components/ui/tabs";

import { PortalBackLink } from "../_components/portal-navigation";
import { AccountingTabs } from "./_components/accounting-tabs";
import { BudgetsPanel } from "./_components/budgets-panel";
import { CommissionPanel } from "./_components/commission-panel";
import { ExpensesPanel } from "./_components/expenses-panel";
import { MonthlyPlansPanel } from "./_components/monthly-plans-panel";
import { OverviewPanel } from "./_components/overview-panel";
import { PaymentsPanel } from "./_components/payments-panel";
import { PayrollPanel } from "./_components/payroll-panel";
import { ReportsPanel } from "./_components/reports-panel";
import { RequestsPanel } from "./_components/requests-panel";
import { SettingsPanel } from "./_components/settings-panel";
import { VaultsPanel } from "./_components/vaults-panel";
import { VendorsPanel } from "./_components/vendors-panel";

// Real Accounting app (renamed from "Finance" -- docs/plans/05-accounting-app-blueprint.md
// Part B.1. Route stays /dashboard/finance so the real /receipt/:token
// links and any bookmarks keep working; only the display name changed.
// Overview/Payments/Expenses/Commission are real (04-finance-app-plan.md);
// Payroll/Settings/Reports are real (05-accounting-app-blueprint.md Part B.7/B.8/B.10).
export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <PortalBackLink fallback="/dashboard/default" />
      </div>
      <PageHeader
        title="Accounting"
        description="Client collections, budgets, requests, treasury, expenses and payroll."
      />

      <AccountingTabs>
        <TabsContent value="overview">
          <OverviewPanel />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsPanel />
        </TabsContent>

        <TabsContent value="installments">
          <MonthlyPlansPanel />
        </TabsContent>

        <TabsContent value="expenses">
          <ExpensesPanel />
        </TabsContent>

        <TabsContent value="commission">
          <CommissionPanel />
        </TabsContent>

        <TabsContent value="payroll">
          <PayrollPanel />
        </TabsContent>

        <TabsContent value="vaults">
          <VaultsPanel />
        </TabsContent>

        <TabsContent value="budgets">
          <BudgetsPanel />
        </TabsContent>

        <TabsContent value="requests">
          <RequestsPanel />
        </TabsContent>

        <TabsContent value="vendors">
          <VendorsPanel />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsPanel />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
      </AccountingTabs>
    </div>
  );
}
