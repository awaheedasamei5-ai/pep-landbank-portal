"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Expenses (Finance app, Part B.3 -- docs/plans/04-finance-app-plan.md).
// Schema, RLS and the prevent_non_manager_expense_approval trigger were all
// confirmed live before writing this -- no new tables. receipt_data/
// receipt_name are real text columns (inline data, not Supabase Storage),
// so receipts are stored as a data URI directly, matching the real schema.
// payment_method and status are both real check-constrained enums --
// 'cash'|'momo'|'bank' and 'pending'|'approved'|'rejected' -- distinct
// from the payments table's own (larger, differently-named) enums.
export const EXPENSE_PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "momo", label: "Mobile Money" },
  { value: "bank", label: "Bank Transfer" },
] as const;

export interface ExpenseCategory {
  id: string;
  name: string;
  active: boolean;
  monthlyBudget: number | null;
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  paymentMethod: string;
  expenseDate: string;
  description: string | null;
  receiptData: string | null;
  receiptName: string | null;
  loggedBy: string;
  loggedByName: string | null;
  status: "pending" | "approved" | "rejected";
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

type RawExpense = {
  id: string;
  category: string;
  amount: number;
  payment_method: string;
  expense_date: string;
  description: string | null;
  receipt_data: string | null;
  receipt_name: string | null;
  logged_by: string;
  logged_by_name: string | null;
  status: Expense["status"];
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

function mapExpense(row: RawExpense): Expense {
  return {
    id: row.id,
    category: row.category,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    expenseDate: row.expense_date,
    description: row.description,
    receiptData: row.receipt_data,
    receiptName: row.receipt_name,
    loggedBy: row.logged_by,
    loggedByName: row.logged_by_name,
    status: row.status,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
  };
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense-categories"],
    queryFn: async (): Promise<ExpenseCategory[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("expense_categories").select("id,name,active,monthly_budget").eq("active", true).order("name");
      if (error) throw error;
      return ((data ?? []) as { id: string; name: string; active: boolean; monthly_budget: number | null }[]).map((c) => ({
        id: c.id,
        name: c.name,
        active: c.active,
        monthlyBudget: c.monthly_budget === null ? null : Number(c.monthly_budget),
      }));
    },
  });
}

export function useExpenses() {
  return useQuery({
    queryKey: ["finance-expenses"],
    queryFn: async (): Promise<Expense[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("expenses")
        .select(
          "id,category,amount,payment_method,expense_date,description,receipt_data,receipt_name,logged_by,logged_by_name,status,decided_by_name,decided_at,decision_note,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data ?? []) as RawExpense[]).map(mapExpense);
    },
  });
}

export function useLogExpense(loggedBy: string | undefined, loggedByName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { category: string; amount: number; paymentMethod: string; expenseDate: string; description: string; receiptData: string | null; receiptName: string | null }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("expenses").insert({
        category: input.category,
        amount: input.amount,
        payment_method: input.paymentMethod,
        expense_date: input.expenseDate,
        description: input.description || null,
        receipt_data: input.receiptData,
        receipt_name: input.receiptName,
        logged_by: loggedBy,
        logged_by_name: loggedByName ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-expenses"] }),
  });
}

export function useDecideExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { expenseId: string; status: "approved" | "rejected"; decisionNote: string; callerKey: string; callerName: string }) => {
      const sb = requireSupabase();
      const { error } = await sb
        .from("expenses")
        .update({
          status: input.status,
          decision_note: input.decisionNote || null,
          decided_by: input.callerKey,
          decided_by_name: input.callerName,
          decided_at: new Date().toISOString(),
        })
        .eq("id", input.expenseId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-expenses"] }),
  });
}
