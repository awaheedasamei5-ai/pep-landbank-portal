"use client";

import { useQuery } from "@tanstack/react-query";

import { today } from "@/lib/palmstead/format";
import { requireSupabase } from "@/lib/supabase.client";

// Real Finance Overview (Part B.2 -- docs/plans/04-finance-app-plan.md).
// Built after Payments + Expenses so its KPIs read from real ledgers, not
// empty shells. Same real source-of-truth columns as the dashboard's own
// MetricCards (leads.grand_total/amt_paid) for collected/outstanding, so
// the two screens can never silently disagree with each other.
export interface FinanceOverview {
  collectedThisMonth: number;
  outstanding: number;
  expenseBurnThisMonth: number;
  pendingPaymentsCount: number;
  pendingExpensesCount: number;
}

async function fetchFinanceOverview(scope: { isManager: boolean; agentKey: string | undefined }): Promise<FinanceOverview> {
  const sb = requireSupabase();
  const monthStart = `${today().slice(0, 7)}-01`;

  let paymentsQuery = sb.from("payments").select("amount,status,payment_date,agent_key").gte("payment_date", monthStart);
  let leadsQuery = sb.from("leads").select("agent_key,grand_total,amt_paid").is("deleted_at", null);
  let expensesQuery = sb.from("expenses").select("amount,status,expense_date,logged_by").gte("expense_date", monthStart);

  if (!scope.isManager && scope.agentKey) {
    paymentsQuery = paymentsQuery.eq("agent_key", scope.agentKey);
    leadsQuery = leadsQuery.eq("agent_key", scope.agentKey);
    expensesQuery = expensesQuery.eq("logged_by", scope.agentKey);
  }

  const [paymentsRes, leadsRes, expensesRes] = await Promise.all([paymentsQuery, leadsQuery, expensesQuery]);
  if (paymentsRes.error) throw paymentsRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (expensesRes.error) throw expensesRes.error;

  const payments = (paymentsRes.data ?? []) as { amount: number; status: string }[];
  const leads = (leadsRes.data ?? []) as { grand_total: number | null; amt_paid: number | null }[];
  const expenses = (expensesRes.data ?? []) as { amount: number; status: string }[];

  const collectedThisMonth = payments.filter((p) => p.status === "approved").reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = leads.reduce((s, l) => s + Math.max(Number(l.grand_total ?? 0) - Number(l.amt_paid ?? 0), 0), 0);
  const expenseBurnThisMonth = expenses.filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.amount), 0);

  return {
    collectedThisMonth,
    outstanding,
    expenseBurnThisMonth,
    pendingPaymentsCount: payments.filter((p) => p.status === "pending").length,
    pendingExpensesCount: expenses.filter((e) => e.status === "pending").length,
  };
}

export function useFinanceOverview(isManager: boolean, agentKey: string | undefined) {
  return useQuery({
    queryKey: ["finance-overview", isManager, agentKey],
    queryFn: () => fetchFinanceOverview({ isManager, agentKey }),
  });
}
