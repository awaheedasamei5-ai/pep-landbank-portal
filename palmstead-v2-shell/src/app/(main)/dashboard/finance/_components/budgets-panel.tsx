"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

type Budget = {
  id: string;
  department_id: string;
  fiscal_year: number;
  category: string;
  revision: number;
  amount: number;
  status: string;
  reason: string;
  created_by: string;
  activated_at: string | null;
};
type Request = { department_id: string | null; needed_by: string; category: string; amount: number; status: string };
type Department = { id: string; name: string; active: boolean };

const money = (amount: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(amount);
const validAmount = (value: string) => /^\d{1,12}(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;

export function BudgetsPanel() {
  const profile = useAuthStore((state) => state.profile);
  const manager = profile?.role === "manager";
  const qc = useQueryClient();
  const [departmentId, setDepartmentId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["finance-budgets"],
    queryFn: async () => {
      const sb = requireSupabase();
      const auth = await sb.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error("Your session has expired. Please sign in again.");
      const [budgets, departments, requests, roles] = await Promise.all([
        sb
          .from("finance_budgets")
          .select("id,department_id,fiscal_year,category,revision,amount,status,reason,created_by,activated_at")
          .order("fiscal_year", { ascending: false })
          .order("category"),
        sb.from("finance_departments").select("id,name,active").order("name"),
        sb.from("finance_requests").select("department_id,needed_by,category,amount,status").eq("status", "approved"),
        sb
          .from("finance_role_assignments")
          .select("finance_role")
          .eq("profile_id", auth.data.user.id)
          .is("revoked_at", null),
      ]);
      for (const result of [budgets, departments, requests, roles]) if (result.error) throw result.error;
      return {
        budgets: (budgets.data ?? []) as Budget[],
        departments: (departments.data ?? []) as Department[],
        requests: (requests.data ?? []) as Request[],
        roles: roles.data ?? [],
        canActivate: (roles.data ?? []).some((r) => r.finance_role === "finance_head"),
        userId: auth.data.user.id,
      };
    },
  });
  const mutation = useMutation({
    mutationFn: async (action: { kind: "create" | "activate"; id?: string }) => {
      const sb = requireSupabase();
      const result =
        action.kind === "create"
          ? await sb.rpc("finance_create_budget", {
              p_department_id: departmentId,
              p_fiscal_year: Number(year),
              p_category: category.trim(),
              p_amount: Number(amount),
              p_reason: reason.trim(),
            })
          : await sb.rpc("finance_activate_budget", { p_budget_id: action.id });
      if (result.error) throw result.error;
      return action.kind;
    },
    onSuccess: async (kind) => {
      await qc.invalidateQueries({ queryKey: ["finance-budgets"] });
      setMessage(
        kind === "create" ? "Draft created. A different Head of Finance must activate it." : "Budget activated.",
      );
      if (kind === "create") {
        setCategory("");
        setAmount("");
        setReason("");
      }
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not save budget."),
  });
  const data = query.data;
  const canSeeCommitments =
    manager || data?.canActivate || data?.roles?.some((role) => role.finance_role === "department_head");
  const departmentName = (id: string) => data?.departments.find((d) => d.id === id)?.name ?? "Department";
  const committed = (budget: Budget) =>
    data?.requests
      .filter(
        (r) =>
          r.department_id === budget.department_id &&
          Number(r.needed_by.slice(0, 4)) === budget.fiscal_year &&
          r.category.toLowerCase() === budget.category.toLowerCase(),
      )
      .reduce((sum, r) => sum + Number(r.amount), 0) ?? 0;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Department budgets</CardTitle>
          <CardDescription>
            Annual approved plans and current request commitments. Actual spend and cash movement will appear after
            settlement is linked; these figures are not bank balances.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {query.isLoading && <p className="text-sm text-muted-foreground">Loading budgets…</p>}
          {query.isError && (
            <p role="alert" className="text-sm text-destructive">
              {query.error.message}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
          {manager && (
            <form
              className="grid gap-3 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-5"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate({ kind: "create" });
              }}
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor="budget-department">Department</Label>
                <select
                  id="budget-department"
                  required
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose department</option>
                  {data?.departments
                    .filter((d) => d.active)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="budget-year">Year</Label>
                <Input
                  id="budget-year"
                  type="number"
                  min="2020"
                  max="2100"
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="budget-category">Category</Label>
                <Input
                  id="budget-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                  placeholder="e.g. Operations"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="budget-amount">Approved amount (GHS)</Label>
                <Input
                  id="budget-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="budget-reason">Reason or revision note</Label>
                <Input
                  id="budget-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={3}
                  maxLength={500}
                  required
                />
              </div>
              <Button
                type="submit"
                className="md:col-span-2 xl:col-span-5 xl:justify-self-start"
                disabled={mutation.isPending || !departmentId || !validAmount(amount) || reason.trim().length < 3}
              >
                Create draft budget
              </Button>
            </form>
          )}
          <div className="min-w-0 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3">Department / category</th>
                  <th className="p-3">Year / revision</th>
                  <th className="p-3 text-right">Plan</th>
                  <th className="p-3 text-right">Committed</th>
                  <th className="p-3 text-right">Remaining</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {data?.budgets.map((b) => {
                  const reserved = b.status === "active" ? committed(b) : 0;
                  return (
                    <tr key={b.id} className="border-t">
                      <td className="p-3 font-medium">
                        {departmentName(b.department_id)}
                        <span className="block font-normal text-muted-foreground">{b.category}</span>
                      </td>
                      <td className="p-3">
                        {b.fiscal_year} · v{b.revision}
                      </td>
                      <td className="p-3 text-right tabular-nums">{money(Number(b.amount))}</td>
                      <td className="p-3 text-right tabular-nums">
                        {b.status === "active" && canSeeCommitments ? money(reserved) : "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {b.status === "active" && canSeeCommitments ? money(Number(b.amount) - reserved) : "—"}
                      </td>
                      <td className="p-3 capitalize">{b.status}</td>
                      <td className="p-3">
                        {b.status === "draft" && data.canActivate && b.created_by !== data.userId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={mutation.isPending}
                            onClick={() => mutation.mutate({ kind: "activate", id: b.id })}
                          >
                            Activate
                          </Button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data?.budgets.length && (
              <p className="p-5 text-sm text-muted-foreground">
                No budgets yet. Management can create a draft after setting up departments; a separate Head of Finance
                activates it.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
