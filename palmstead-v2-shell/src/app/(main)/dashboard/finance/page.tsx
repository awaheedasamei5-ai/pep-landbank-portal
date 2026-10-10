import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";

import { PaymentsPanel } from "./_components/payments-panel";

// Real Finance app (replaces the "Log Payment" and "Expenses" sidebar
// placeholders -- docs/plans/04-finance-app-plan.md). Payments ships first
// per Part B's own stated build order; Overview/Expenses/Commission follow
// as their own real slices rather than staying fake template widgets.
export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Finance" description="Payments, expenses and commission in one place." />

      <Tabs defaultValue="payments" className="flex flex-col gap-4">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="commission">Commission</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="flex h-64 items-center justify-center rounded-xl border border-border border-dashed text-muted-foreground">
            Overview ships once Payments and Expenses both have real data flowing.
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsPanel />
        </TabsContent>

        <TabsContent value="expenses">
          <div className="flex h-64 items-center justify-center rounded-xl border border-border border-dashed text-muted-foreground">
            Expenses — next in the build order.
          </div>
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
