"use client";

import { useEffect, type ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/stores/auth/auth-store";

import { usePortalTab } from "../../_components/portal-navigation";
import { useFinanceRealtime } from "./use-finance-realtime";

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
  const isManager = useAuthStore((state) => state.profile?.role === "manager");
  const restricted = !isManager && (value === "payroll" || value === "settings");
  useEffect(() => {
    if (restricted) select("overview");
  }, [restricted, select]);
  useFinanceRealtime();
  return (
    <Tabs value={restricted ? "overview" : value} onValueChange={select} className="flex min-w-0 flex-col gap-4">
      <div className="max-w-full overflow-x-auto pb-2">
        <TabsList variant="line" aria-label="Accounting sections">
          {tabs.filter((tab) => isManager || (tab !== "payroll" && tab !== "settings")).map((tab) => (
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

