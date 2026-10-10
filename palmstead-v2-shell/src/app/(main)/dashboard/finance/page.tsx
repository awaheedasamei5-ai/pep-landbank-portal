import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";

import { CommissionPanel } from "./_components/commission-panel";
import { ExpensesPanel } from "./_components/expenses-panel";
import { OverviewPanel } from "./_components/overview-panel";
import { PaymentsPanel } from "./_components/payments-panel";
import { PayrollPanel } from "./_components/payroll-panel";
import { ReportsPanel } from "./_components/reports-panel";
import { SettingsPanel } from "./_components/settings-panel";

// Real Accounting app (renamed from "Finance" -- docs/plans/05-accounting-app-blueprint.md
// Part B.1. Route stays /dashboard/finance so the real /receipt/:token
// links and any bookmarks keep working; only the display name changed.
// Overview/Payments/Expenses/Commission are real (04-finance-app-plan.md);
// Payroll/Settings/Reports are real (05-accounting-app-blueprint.md Part B.7/B.8/B.10).
export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Accounting" description="Payments, expenses, commission and payroll in one place." />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="commission">Commission</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewPanel />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsPanel />
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

        <TabsContent value="reports">
          <ReportsPanel />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
