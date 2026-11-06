"use client";

import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Phase 10 (docs/plans/41 Phase 10 deferred items): Finance's own screens
// never had ANY realtime wiring -- confirmed by grep, none of its panels
// subscribe to postgres_changes anywhere, unlike the rest of the app's
// shared useDashboardRealtime.ts bridge (which Finance doesn't use at all,
// since its query keys live in a separate namespace: "finance-*"/
// "payroll-*" vs. that bridge's camelCase keys). This hook covers the
// specific tables flagged in Phase 10 -- vaults, budgets, vendors, payroll
// -- mounted once for the whole Accounting page so switching tabs always
// shows already-live data. Finance's other tables (payments, monthly
// schedules, expenses, commission) still have no realtime push either;
// that's a real, separate gap, out of this phase's scope.
export function useFinanceRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const client = requireSupabase();
    const channel = client
      .channel("finance-vaults-budgets-vendors-payroll")
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_vaults" }, () =>
        queryClient.invalidateQueries({ queryKey: ["finance-vault-register"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_vault_journals" }, () =>
        queryClient.invalidateQueries({ queryKey: ["finance-vault-register"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_vault_lines" }, () =>
        queryClient.invalidateQueries({ queryKey: ["finance-vault-register"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_budgets" }, () => {
        queryClient.invalidateQueries({ queryKey: ["finance-budgets"] });
        queryClient.invalidateQueries({ queryKey: ["finance-requests"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_vendors" }, () =>
        queryClient.invalidateQueries({ queryKey: ["finance-vendor-bills"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_vendor_bills" }, () => {
        queryClient.invalidateQueries({ queryKey: ["finance-vendor-bills"] });
        queryClient.invalidateQueries({ queryKey: ["finance-vendor-bill-history"] });
        queryClient.invalidateQueries({ queryKey: ["finance-vendor-settlement"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_vendor_bill_events" }, () =>
        queryClient.invalidateQueries({ queryKey: ["finance-vendor-bill-history"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_vendor_events" }, () =>
        queryClient.invalidateQueries({ queryKey: ["finance-vendor-bill-history"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_vendor_payments" }, () => {
        queryClient.invalidateQueries({ queryKey: ["finance-vendor-bills"] });
        queryClient.invalidateQueries({ queryKey: ["finance-vendor-settlement"] });
        queryClient.invalidateQueries({ queryKey: ["finance-vault-register"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_vendor_payment_reversals" }, () => {
        queryClient.invalidateQueries({ queryKey: ["finance-vendor-settlement"] });
        queryClient.invalidateQueries({ queryKey: ["finance-vault-register"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payroll_staff" }, () =>
        queryClient.invalidateQueries({ queryKey: ["payroll-staff"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "payroll_salary_components" }, () => {
        queryClient.invalidateQueries({ queryKey: ["payroll-salary-components"] });
        queryClient.invalidateQueries({ queryKey: ["payroll-configured-staff-ids"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payroll_runs" }, () =>
        queryClient.invalidateQueries({ queryKey: ["payroll-runs"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "payroll_run_lines" }, () =>
        queryClient.invalidateQueries({ queryKey: ["payroll-run-lines"] }),
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [queryClient]);
}
