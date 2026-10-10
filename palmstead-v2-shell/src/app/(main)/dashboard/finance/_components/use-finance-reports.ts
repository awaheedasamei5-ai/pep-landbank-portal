"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real cross-section Report Builder (Accounting app, Part B.10 --
// docs/plans/05-accounting-app-blueprint.md). Real domain research: a
// professional accounting system's core reports are transaction detail
// (ledger-style, filterable by date/status), category/agent breakdowns,
// and a summary income-style statement (revenue in vs expenses/payroll/
// commission out) -- apache/superset (already catalogued in this
// project's OSS strategy memory, LOW literal-merge feasibility) is the
// UX/feature reference for "pick a data source, pick filters, render a
// table or chart," not its code. Every report here reads real live data
// for the real section + date range picked, nothing pre-aggregated or
// faked.
export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

export interface PaymentsReportRow {
  leadName: string;
  agentKey: string;
  amount: number;
  paymentMethod: string | null;
  status: string;
  paymentDate: string;
}

export function usePaymentsReport(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: ["report-payments", range],
    enabled,
    queryFn: async (): Promise<PaymentsReportRow[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("payments")
        .select("client_name,agent_key,amount,payment_method,status,payment_date,leads(name)")
        .gte("payment_date", range.start)
        .lte("payment_date", range.end)
        .order("payment_date");
      if (error) throw error;
      type Raw = { client_name: string | null; agent_key: string; amount: number; payment_method: string | null; status: string; payment_date: string; leads: { name: string } | { name: string }[] | null };
      return ((data ?? []) as unknown as Raw[]).map((r) => ({
        leadName: Array.isArray(r.leads) ? (r.leads[0]?.name ?? r.client_name ?? "Unknown") : (r.leads?.name ?? r.client_name ?? "Unknown"),
        agentKey: r.agent_key,
        amount: Number(r.amount),
        paymentMethod: r.payment_method,
        status: r.status,
        paymentDate: r.payment_date,
      }));
    },
  });
}

export interface ExpensesReportRow {
  category: string;
  amount: number;
  paymentMethod: string;
  status: string;
  expenseDate: string;
  loggedByName: string | null;
}

export function useExpensesReport(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: ["report-expenses", range],
    enabled,
    queryFn: async (): Promise<ExpensesReportRow[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("expenses")
        .select("category,amount,payment_method,status,expense_date,logged_by_name")
        .gte("expense_date", range.start)
        .lte("expense_date", range.end)
        .order("expense_date");
      if (error) throw error;
      return ((data ?? []) as { category: string; amount: number; payment_method: string; status: string; expense_date: string; logged_by_name: string | null }[]).map((r) => ({
        category: r.category,
        amount: Number(r.amount),
        paymentMethod: r.payment_method,
        status: r.status,
        expenseDate: r.expense_date,
        loggedByName: r.logged_by_name,
      }));
    },
  });
}

export interface CommissionReportRow {
  month: string;
  agentName: string;
  personal: number;
  poolShare: number;
  total: number;
}

function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  let cursor = start.slice(0, 7);
  const endMonth = end.slice(0, 7);
  while (cursor <= endMonth) {
    months.push(cursor);
    const [y, m] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return months;
}

export function useCommissionReport(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: ["report-commission", range],
    enabled,
    queryFn: async (): Promise<CommissionReportRow[]> => {
      const sb = requireSupabase();
      const months = monthsBetween(range.start, range.end);
      const rows: CommissionReportRow[] = [];
      for (const month of months) {
        const { data, error } = await sb.rpc("get_commission_breakdown", { p_month: month, p_agent_key: null });
        if (error) throw error;
        type Raw = { agent_name: string; personal: number; pool_share: number; total: number };
        for (const r of (data ?? []) as Raw[]) {
          if (Number(r.total) === 0) continue;
          rows.push({ month, agentName: r.agent_name, personal: Number(r.personal), poolShare: Number(r.pool_share), total: Number(r.total) });
        }
      }
      return rows;
    },
  });
}

export interface PayrollReportRow {
  period: string;
  staffName: string;
  net: number;
  status: string;
}

export function usePayrollReport(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: ["report-payroll", range],
    enabled,
    queryFn: async (): Promise<PayrollReportRow[]> => {
      const sb = requireSupabase();
      const startMonth = range.start.slice(0, 7);
      const endMonth = range.end.slice(0, 7);
      const { data: runs, error: runsError } = await sb.from("payroll_runs").select("id,period,status").gte("period", startMonth).lte("period", endMonth);
      if (runsError) throw runsError;
      const runRows = (runs ?? []) as { id: string; period: string; status: string }[];
      if (runRows.length === 0) return [];
      const { data: lines, error: linesError } = await sb
        .from("payroll_run_lines")
        .select("payroll_run_id,staff_name,component_type,amount")
        .in("payroll_run_id", runRows.map((r) => r.id));
      if (linesError) throw linesError;
      const byRunStaff = new Map<string, number>();
      for (const l of (lines ?? []) as { payroll_run_id: string; staff_name: string; component_type: string; amount: number }[]) {
        const key = `${l.payroll_run_id}::${l.staff_name}`;
        const delta = l.component_type === "earning" ? Number(l.amount) : -Number(l.amount);
        byRunStaff.set(key, (byRunStaff.get(key) ?? 0) + delta);
      }
      const rows: PayrollReportRow[] = [];
      for (const run of runRows) {
        for (const [key, net] of byRunStaff) {
          if (!key.startsWith(`${run.id}::`)) continue;
          rows.push({ period: run.period, staffName: key.split("::")[1], net, status: run.status });
        }
      }
      return rows;
    },
  });
}
