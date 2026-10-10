"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth/auth-store";

import {
  type LeadOption,
  type Payment,
  PAYMENT_METHODS,
  useApprovePayment,
  useDeclinePayment,
  useFlagPaymentCorrection,
  useHasPaymentsManage,
  useLeadSearch,
  useLogPayment,
  usePayments,
  useResubmitPayment,
} from "./use-finance-payments";

const STATUS_VARIANT: Record<Payment["status"], "outline" | "default" | "destructive" | "secondary"> = {
  pending: "outline",
  approved: "default",
  declined: "destructive",
  needs_correction: "secondary",
};

const STATUS_LABEL: Record<Payment["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  needs_correction: "Needs correction",
};

function money(n: number): string {
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function LogPaymentDialog({ canManage, callerRole }: { canManage: boolean; callerRole: "agent" | "manager" | undefined }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("Cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const { data: leads, isFetching: searching } = useLeadSearch(search);
  const logPayment = useLogPayment(callerRole);

  function reset() {
    setSearch("");
    setSelectedLead(null);
    setAmount("");
    setMethod("Cash");
    setReference("");
    setNote("");
  }

  async function submit() {
    if (!selectedLead) return;
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) return;
    await logPayment.mutateAsync({ lead: selectedLead, amount: parsed, paymentMethod: method, note, referenceNumber: reference });
    reset();
    setOpen(false);
  }

  if (!canManage) return null;

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
          Log payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a payment</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Client / lead</Label>
            {selectedLead ? (
              <div className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{selectedLead.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {selectedLead.plotType ?? "—"} · Paid {money(selectedLead.amtPaid)} of {money(selectedLead.grandTotal)}
                  </div>
                </div>
                <Button variant="ghost" size="icon-xs" onClick={() => setSelectedLead(null)}>
                  <X />
                </Button>
              </div>
            ) : (
              <Combobox
                items={leads ?? []}
                itemToStringLabel={(l: LeadOption) => l.name}
                isItemEqualToValue={(a: LeadOption, b: LeadOption) => a.id === b.id}
                inputValue={search}
                onInputValueChange={setSearch}
                onValueChange={(v) => setSelectedLead(v as LeadOption | null)}
              >
                <ComboboxInput placeholder="Search client by name…" showTrigger={false} />
                <ComboboxContent>
                  <ComboboxEmpty>{searching ? "Searching…" : "No leads found"}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: LeadOption) => (
                      <ComboboxItem key={item.id} value={item}>
                        <div>
                          <div>{item.name}</div>
                          <div className="text-muted-foreground text-xs">{item.plotType ?? "—"}</div>
                        </div>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">Amount (GHS)</Label>
            <Input id="payment-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-reference">Reference number (optional)</Label>
            <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction / receipt ref" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-note">Note (optional)</Label>
            <Textarea id="payment-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          {callerRole !== "manager" && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5" />
              This payment will land as pending until Management approves it.
            </p>
          )}
        </div>
        <DialogFooter>
          <SubmitButton onClick={submit} loading={logPayment.isPending} disabled={!selectedLead || !amount}>
            Log payment
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeclineDialog({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const decline = useDeclinePayment();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <X data-icon="inline-start" />
          Decline
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Decline payment</DialogTitle>
        </DialogHeader>
        <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        <DialogFooter>
          <SubmitButton
            variant="destructive"
            loading={decline.isPending}
            onClick={async () => {
              await decline.mutateAsync({ paymentId, reason });
              setOpen(false);
            }}
          >
            Decline
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlagCorrectionDialog({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const flag = useFlagPaymentCorrection();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <AlertTriangle data-icon="inline-start" />
          Needs correction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Flag for correction</DialogTitle>
        </DialogHeader>
        <Textarea placeholder="What needs to change?" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        <DialogFooter>
          <SubmitButton
            loading={flag.isPending}
            disabled={!reason.trim()}
            onClick={async () => {
              await flag.mutateAsync({ paymentId, reason: reason.trim() });
              setOpen(false);
            }}
          >
            Flag
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResubmitDialog({ payment }: { payment: Payment }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.paymentMethod ?? "Cash");
  const [note, setNote] = useState("");
  const resubmit = useResubmitPayment();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Resubmit</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Resubmit payment</DialogTitle>
        </DialogHeader>
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{payment.correctionReason}</p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Amount (GHS)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <SubmitButton
            loading={resubmit.isPending}
            onClick={async () => {
              await resubmit.mutateAsync({ paymentId: payment.id, amount: Number(amount), paymentMethod: method, note });
              setOpen(false);
            }}
          >
            Resubmit for review
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentsPanel() {
  const profile = useAuthStore((s) => s.profile);
  const { data: canManage, isLoading: loadingPermission } = useHasPaymentsManage();
  const { data: payments, isLoading } = usePayments();
  const approve = useApprovePayment();

  const visible = useMemo(() => {
    if (!payments) return [];
    if (canManage) return payments;
    return payments.filter((p) => p.agentKey === profile?.key);
  }, [payments, canManage, profile?.key]);

  const pendingQueue = useMemo(() => visible.filter((p) => p.status === "pending"), [visible]);

  if (isLoading || loadingPermission) {
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
          <h2 className="text-lg font-medium">Payments ledger</h2>
          <p className="text-sm text-muted-foreground">{canManage ? "Every payment across all agents." : "Your own leads' payment history."}</p>
        </div>
        <LogPaymentDialog canManage={!!canManage} callerRole={profile?.role} />
      </div>

      {profile?.role === "manager" && pendingQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approval queue</CardTitle>
            <CardDescription>{pendingQueue.length} payment(s) awaiting a decision.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pendingQueue.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <div className="font-medium">{p.leadName}</div>
                  <div className="text-muted-foreground text-xs">
                    {money(p.amount)} · {p.paymentMethod ?? "—"} · logged by {p.agentKey}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => approve.mutate(p.id)} disabled={approve.isPending}>
                    {approve.isPending ? <Loader2 className="animate-spin" /> : <Check data-icon="inline-start" />}
                    Approve
                  </Button>
                  <FlagCorrectionDialog paymentId={p.id} />
                  <DeclineDialog paymentId={p.id} />
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
                <TableHead>Client</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No payments logged yet.
                  </TableCell>
                </TableRow>
              )}
              {visible.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.leadName}</TableCell>
                  <TableCell className="tabular-nums">{money(p.amount)}</TableCell>
                  <TableCell>{p.paymentMethod ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    {p.status === "declined" && <div className="mt-1 text-xs text-muted-foreground">{p.correctionReason}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(p.paymentDate).toLocaleDateString("en-GB")}</TableCell>
                  <TableCell className="text-right">
                    {p.status === "needs_correction" && (profile?.role === "manager" || profile?.key === "elias") && <ResubmitDialog payment={p} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
