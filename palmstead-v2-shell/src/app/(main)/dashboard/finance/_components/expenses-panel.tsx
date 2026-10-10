"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Paperclip, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";

import { EXPENSE_PAYMENT_METHODS, type Expense, useDecideExpense, useExpenseCategories, useExpenses, useLogExpense } from "./use-finance-expenses";

const STATUS_VARIANT: Record<Expense["status"], "outline" | "default" | "destructive"> = {
  pending: "outline",
  approved: "default",
  rejected: "destructive",
};

function money(n: number): string {
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function LogExpenseDialog({ callerKey, callerName }: { callerKey: string | undefined; callerName: string | undefined }) {
  const [open, setOpen] = useState(false);
  const { data: categories } = useExpenseCategories();
  const logExpense = useLogExpense(callerKey, callerName);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  function reset() {
    setCategory("");
    setAmount("");
    setMethod("cash");
    setDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    setReceiptFile(null);
  }

  async function submit() {
    const parsed = Number(amount);
    if (!category || !parsed || parsed <= 0) return;
    let receiptData: string | null = null;
    let receiptName: string | null = null;
    if (receiptFile) {
      receiptData = await fileToDataUri(receiptFile);
      receiptName = receiptFile.name;
    }
    await logExpense.mutateAsync({ category, amount: parsed, paymentMethod: method, expenseDate: date, description, receiptData, receiptName });
    reset();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          Log expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log an expense</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-amount">Amount (GHS)</Label>
            <Input id="expense-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-date">Date</Label>
            <Input id="expense-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-description">Description (optional)</Label>
            <Textarea id="expense-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-receipt">Receipt (optional)</Label>
            {receiptFile ? (
              <div className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5 truncate">
                  <Paperclip className="size-3.5 shrink-0" />
                  {receiptFile.name}
                </span>
                <Button variant="ghost" size="icon-xs" onClick={() => setReceiptFile(null)}>
                  <X />
                </Button>
              </div>
            ) : (
              <Input id="expense-receipt" type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
            )}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5" />
            This expense will land as pending until Management approves it.
          </p>
        </div>
        <DialogFooter>
          <SubmitButton onClick={submit} loading={logExpense.isPending} disabled={!category || !amount}>
            Log expense
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function methodLabel(method: string): string {
  return EXPENSE_PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

function DecideExpenseDialog({ expense, status, callerKey, callerName }: { expense: Expense; status: "approved" | "rejected"; callerKey: string; callerName: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const decide = useDecideExpense();
  const isApprove = status === "approved";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={isApprove ? "default" : "outline"}>
          {isApprove ? <Check data-icon="inline-start" /> : <X data-icon="inline-start" />}
          {isApprove ? "Approve" : "Reject"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isApprove ? "Approve" : "Reject"} expense</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {expense.category} · {money(expense.amount)} · logged by {expense.loggedByName ?? expense.loggedBy}
        </p>
        <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        <DialogFooter>
          <SubmitButton
            variant={isApprove ? "default" : "destructive"}
            loading={decide.isPending}
            onClick={async () => {
              await decide.mutateAsync({ expenseId: expense.id, status, decisionNote: note, callerKey, callerName });
              setOpen(false);
            }}
          >
            {isApprove ? "Approve" : "Reject"}
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExpensesPanel() {
  const profile = useAuthStore((s) => s.profile);
  const isManager = profile?.role === "manager";
  const { data: expenses, isLoading } = useExpenses();
  const { data: categories } = useExpenseCategories();

  const visible = useMemo(() => {
    if (!expenses) return [];
    if (isManager) return expenses;
    return expenses.filter((e) => e.loggedBy === profile?.key);
  }, [expenses, isManager, profile?.key]);

  const pendingQueue = useMemo(() => visible.filter((e) => e.status === "pending"), [visible]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const budgetRows = useMemo(() => {
    if (!categories || !expenses) return [];
    return categories
      .filter((c) => c.monthlyBudget !== null)
      .map((c) => {
        const spent = expenses.filter((e) => e.category === c.name && e.status === "approved" && e.expenseDate.startsWith(thisMonth)).reduce((sum, e) => sum + e.amount, 0);
        return { category: c.name, budget: c.monthlyBudget as number, spent };
      });
  }, [categories, expenses, thisMonth]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Expenses</h2>
          <p className="text-sm text-muted-foreground">{isManager ? "Every expense across the team." : "Your own logged expenses."}</p>
        </div>
        <LogExpenseDialog callerKey={profile?.key} callerName={profile?.name} />
      </div>

      {budgetRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category budgets this month</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {budgetRows.map((r) => {
              const pct = r.budget > 0 ? Math.min(100, (r.spent / r.budget) * 100) : 0;
              return (
                <div key={r.category} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.category}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {money(r.spent)} / {money(r.budget)}
                    </span>
                  </div>
                  <Progress value={pct} className={r.spent > r.budget ? "[&>div]:bg-destructive" : undefined} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {isManager && pendingQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approval queue</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pendingQueue.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <div className="font-medium">{e.category}</div>
                  <div className="text-muted-foreground text-xs">
                    {money(e.amount)} · {methodLabel(e.paymentMethod)} · logged by {e.loggedByName ?? e.loggedBy}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DecideExpenseDialog expense={e} status="approved" callerKey={profile?.key ?? ""} callerName={profile?.name ?? ""} />
                  <DecideExpenseDialog expense={e} status="rejected" callerKey={profile?.key ?? ""} callerName={profile?.name ?? ""} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Logged by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No expenses logged yet.
                  </TableCell>
                </TableRow>
              )}
              {visible.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.category}</TableCell>
                  <TableCell className="tabular-nums">{money(e.amount)}</TableCell>
                  <TableCell>{methodLabel(e.paymentMethod)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[e.status]}>{e.status[0].toUpperCase() + e.status.slice(1)}</Badge>
                    {e.status === "rejected" && e.decisionNote && <div className="mt-1 text-xs text-muted-foreground">{e.decisionNote}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(e.expenseDate).toLocaleDateString("en-GB")}</TableCell>
                  <TableCell className="text-muted-foreground">{e.loggedByName ?? e.loggedBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
