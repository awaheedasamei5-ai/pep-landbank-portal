"use client";

import type { ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { usePortalTab } from "../../_components/portal-navigation";

const tabs = [
  "overview",
  "payments",
  "installments",
  "expenses",
  "commission",
  "payroll",
  "vaults",
  "budgets",
  "requests",
  "vendors",
  "reports",
  "settings",
] as const;

export function AccountingTabs({ children }: { children: ReactNode }) {
  const [value, select] = usePortalTab("tab", tabs, "overview");
  return (
    <Tabs value={value} onValueChange={select} className="flex min-w-0 flex-col gap-4">
      <div className="max-w-full overflow-x-auto pb-2">
        <TabsList variant="line" aria-label="Accounting sections">
          {tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {tab[0].toUpperCase() + tab.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}
