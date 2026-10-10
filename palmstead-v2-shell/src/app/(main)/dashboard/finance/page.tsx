import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";

import { ExpensesPanel } from "./_components/expenses-panel";
import { OverviewPanel } from "./_components/overview-panel";
import { PaymentsPanel } from "./_components/payments-panel";

// Real Finance app (replaces the "Log Payment" and "Expenses" sidebar
// placeholders -- docs/plans/04-finance-app-plan.md). Payments and Expenses
// shipped first so Overview's KPIs read from real ledgers, not empty
// shells; Commission is the one tab still pending.
export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Finance" description="Payments, expenses and commission in one place." />

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="commission">Commission</TabsTrigger>
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
          <div className="flex h-64 items-center justify-center rounded-xl border border-border border-dashed text-muted-foreground">
            Commission breakdown — last in the build order.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
