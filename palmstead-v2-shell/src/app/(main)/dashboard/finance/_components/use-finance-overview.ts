"use client";

import { useQuery } from "@tanstack/react-query";

import { monthKey, shiftMonth, today } from "@/lib/palmstead/format";
import { requireSupabase } from "@/lib/supabase.client";

// Real Finance Overview (Part B.2 -- docs/plans/04-finance-app-plan.md).
// Built after Payments + Expenses so its KPIs read from real ledgers, not
// empty shells. Same real source-of-truth columns as the dashboard's own
// MetricCards (leads.grand_total/amt_paid) for collected/outstanding, so
// the two screens can never silently disagree with each other.
//
// monthlyTrend/categoryBreakdown exist so the Overview tab can carry real
// charts (a 6-month collected-vs-expenses bar chart, a category spend
// breakdown) in the same visual language as the shell's own finance-v1
// template reference, rather than four flat KPI cards and nothing else.
export interface FinanceOverview {
  collectedThisMonth: number;
  outstanding: number;
  expenseBurnThisMonth: number;
  pendingPaymentsCount: number;
  pendingExpensesCount: number;
  monthlyTrend: { month: string; collected: number; expenses: number }[];
  categoryBreakdown: { category: string; amount: number }[];
}

async function fetchFinanceOverview(scope: { isManager: boolean; agentKey: string | undefined }): Promise<FinanceOverview> {
  const sb = requireSupabase();
  const thisMonth = today().slice(0, 7);
  const monthStart = `${thisMonth}-01`;
  const sixMonthsAgoStart = `${shiftMonth(thisMonth, -5)}-01`;

  let paymentsQuery = sb.from("payments").select("amount,status,payment_date,agent_key").gte("payment_date", sixMonthsAgoStart);
  let leadsQuery = sb.from("leads").select("agent_key,grand_total,amt_paid").is("deleted_at", null);
  let expensesQuery = sb.from("expenses").select("amount,status,expense_date,logged_by,category").gte("expense_date", sixMonthsAgoStart);

  if (!scope.isManager && scope.agentKey) {
    paymentsQuery = paymentsQuery.eq("agent_key", scope.agentKey);
    leadsQuery = leadsQuery.eq("agent_key", scope.agentKey);
    expensesQuery = expensesQuery.eq("logged_by", scope.agentKey);
  }

  const [paymentsRes, leadsRes, expensesRes] = await Promise.all([paymentsQuery, leadsQuery, expensesQuery]);
  if (paymentsRes.error) throw paymentsRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (expensesRes.error) throw expensesRes.error;

  const payments = (paymentsRes.data ?? []) as { amount: number; status: string; payment_date: string }[];
  const leads = (leadsRes.data ?? []) as { grand_total: number | null; amt_paid: number | null }[];
  const expenses = (expensesRes.data ?? []) as { amount: number; status: string; expense_date: string; category: string }[];

  const approvedPayments = payments.filter((p) => p.status === "approved");
  const approvedExpenses = expenses.filter((e) => e.status === "approved");

  const collectedThisMonth = approvedPayments.filter((p) => monthKey(p.payment_date) === thisMonth).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = leads.reduce((s, l) => s + Math.max(Number(l.grand_total ?? 0) - Number(l.amt_paid ?? 0), 0), 0);
  const expenseBurnThisMonth = approvedExpenses.filter((e) => monthKey(e.expense_date) === thisMonth).reduce((s, e) => s + Number(e.amount), 0);

  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(thisMonth, i - 5));
  const monthlyTrend = months.map((mk) => ({
    month: mk,
    collected: approvedPayments.filter((p) => monthKey(p.payment_date) === mk).reduce((s, p) => s + Number(p.amount), 0),
    expenses: approvedExpenses.filter((e) => monthKey(e.expense_date) === mk).reduce((s, e) => s + Number(e.amount), 0),
  }));

  const categoryMap = new Map<string, number>();
  for (const e of approvedExpenses.filter((e) => monthKey(e.expense_date) === thisMonth)) {
    categoryMap.set(e.category, (categoryMap.get(e.category) ?? 0) + Number(e.amount));
  }
  const categoryBreakdown = [...categoryMap.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);

  return {
    collectedThisMonth,
    outstanding,
    expenseBurnThisMonth,
    pendingPaymentsCount: payments.filter((p) => p.status === "pending" && monthKey(p.payment_date) === thisMonth).length,
    pendingExpensesCount: expenses.filter((e) => e.status === "pending" && monthKey(e.expense_date) === thisMonth).length,
    monthlyTrend,
    categoryBreakdown,
  };
}

export function useFinanceOverview(isManager: boolean, agentKey: string | undefined) {
  return useQuery({
    queryKey: ["finance-overview", isManager, agentKey],
    queryFn: () => fetchFinanceOverview({ isManager, agentKey }),
  });
}
