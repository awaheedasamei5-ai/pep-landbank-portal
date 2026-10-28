"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requireSupabase } from "@/lib/supabase.client";

type Bill = {
  id: string;
  amount: number;
  invoice_date: string;
  invoice_number: string;
  status: string;
};
type Vault = {
  id: string;
  code: string;
  name: string;
  kind: string;
  active: boolean;
  balance: number;
};
type Payment = {
  id: string;
  bill_id: string;
  source_vault_id: string;
  amount: number;
  paid_on: string;
  evidence_reference: string;
  proof_path: string;
  recorded_at: string;
  recorded_by: string;
};
type Reversal = {
  id: string;
  payment_id: string;
  evidence_reference: string;
  reason: string;
  recorded_at: string;
  recorded_by: string;
};
type Props = {
  bill: Bill;
  vendorName: string;
  financeHead: boolean;
  manager: boolean;
  userId: string;
  person: (id: string) => string;
};

const money = (value: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value);
const toPesewas = (value: number) => Math.round(value * 100);
const amountValid = (value: string) => /^\d{1,12}(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
const mimeExtension: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function VendorSettlementPanel({ bill, vendorName, financeHead, manager, userId, person }: Props) {
  const qc = useQueryClient();
  const [vaultId, setVaultId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReference, setReverseReference] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  const [message, setMessage] = useState("");

  const query = useQuery({
    queryKey: ["finance-vendor-settlement", bill.id],
    enabled: bill.status === "approved",
    queryFn: async () => {
      const sb = requireSupabase();
      const [payments, vaults] = await Promise.all([
        sb
          .from("finance_vendor_payments")
          .select("id,bill_id,source_vault_id,amount,paid_on,evidence_reference,proof_path,recorded_at,recorded_by")
          .eq("bill_id", bill.id)
          .order("recorded_at"),
        sb.rpc("finance_list_vault_balances"),
      ]);
      for (const result of [payments, vaults]) if (result.error) throw result.error;
      const billPayments = (payments.data ?? []) as Payment[];
      const reversals = billPayments.length
        ? await sb
            .from("finance_vendor_payment_reversals")
            .select("id,payment_id,evidence_reference,reason,recorded_at,recorded_by")
            .in(
              "payment_id",
              billPayments.map((payment) => payment.id),
            )
        : { data: [] as Reversal[], error: null };
      if (reversals.error) throw reversals.error;
      return {
        payments: billPayments,
        reversals: (reversals.data ?? []) as Reversal[],
        vaults: (vaults.data ?? []) as Vault[],
      };
    },
  });
  const data = query.data;
  const reversedIds = new Set(data?.reversals.map((item) => item.payment_id) ?? []);
  const paidPesewas =
    data?.payments.reduce(
      (total, payment) => total + (reversedIds.has(payment.id) ? 0 : toPesewas(Number(payment.amount))),
      0,
    ) ?? 0;
  const outstandingPesewas = Math.max(0, toPesewas(Number(bill.amount)) - paidPesewas);
  const settlementLabel = outstandingPesewas === 0 ? "Fully settled" : paidPesewas > 0 ? "Partly settled" : "Unpaid";
  const available = data?.vaults.filter((vault) => vault.active && Number(vault.balance) > 0) ?? [];
  const selectedVault = available.find((vault) => vault.id === vaultId);
  const amountPesewas = toPesewas(Number(amount));
  const uploadValid = proof && proof.size > 0 && proof.size <= 5 * 1024 * 1024 && Boolean(mimeExtension[proof.type]);
  const paymentValid =
    financeHead &&
    Boolean(selectedVault) &&
    amountValid(amount) &&
    amountPesewas <= outstandingPesewas &&
    amountPesewas <= toPesewas(Number(selectedVault?.balance ?? 0)) &&
    paidOn >= bill.invoice_date &&
    paidOn <= new Date().toISOString().slice(0, 10) &&
    reference.trim().length >= 4 &&
    uploadValid;

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!proof || !paymentValid) throw new Error("Complete the payment and attach a PDF or image proof.");
      const sb = requireSupabase();
      const path = `${bill.id}/${crypto.randomUUID()}.${mimeExtension[proof.type]}`;
      const upload = await sb.storage.from("finance-vendor-proofs").upload(path, proof, {
        contentType: proof.type,
        upsert: false,
      });
      if (upload.error) throw upload.error;
      const recorded = await sb.rpc("finance_record_vendor_payment", {
        p_bill_id: bill.id,
        p_vault_id: vaultId,
        p_amount: Number(amount),
        p_paid_on: paidOn,
        p_evidence_reference: reference.trim(),
        p_proof_path: path,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (recorded.error) {
        const check = await sb.from("finance_vendor_payments").select("id").eq("proof_path", path).maybeSingle();
        if (check.data) return check.data.id;
        if (check.error)
          throw new Error(
            `Payment status could not be confirmed: ${check.error.message}. Check the payment history before retrying.`,
          );
        const cleanup = await sb.storage.from("finance-vendor-proofs").remove([path]);
        if (cleanup.error) throw new Error(`${recorded.error.message} The uploaded proof needs Finance cleanup.`);
        throw recorded.error;
      }
      return recorded.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["finance-vendor-settlement", bill.id] });
      await qc.invalidateQueries({ queryKey: ["finance-vendor-bills"] });
      setAmount("");
      setReference("");
      setProof(null);
      setMessage("Confirmed payment and its proof were recorded against the vault and payable.");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Payment could not be recorded."),
  });
  const reversalMutation = useMutation({
    mutationFn: async () => {
      if (!reverseId) throw new Error("Choose a payment to reverse.");
      const { data: result, error } = await requireSupabase().rpc("finance_reverse_vendor_payment", {
        p_payment_id: reverseId,
        p_evidence_reference: reverseReference.trim(),
        p_reason: reverseReason.trim(),
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;
      return result;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["finance-vendor-settlement", bill.id] });
      setReverseId(null);
      setReverseReference("");
      setReverseReason("");
      setMessage("Reversal posted. The vault and outstanding payable were restored.");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Reversal could not be recorded."),
  });
  const downloadProof = async (payment: Payment) => {
    const { data: file, error } = await requireSupabase()
      .storage.from("finance-vendor-proofs")
      .download(payment.proof_path);
    if (error || !file) {
      setMessage(error?.message ?? "Proof could not be downloaded.");
      return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Vendor-payment-${payment.evidence_reference.replace(/[^a-zA-Z0-9_-]/g, "_")}.${payment.proof_path.split(".").pop() ?? "pdf"}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (bill.status !== "approved") return null;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Settlement and outstanding</CardTitle>
        <CardDescription>
          Payments here record completed bank or cash disbursements. Recording one never initiates a transfer.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        {query.isLoading && <p className="text-sm text-muted-foreground">Loading payments and vault balances…</p>}
        {query.isError && (
          <Alert variant="destructive">
            <AlertTitle>Settlement unavailable</AlertTitle>
            <AlertDescription>{query.error.message}</AlertDescription>
          </Alert>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Outstanding on {vendorName} · {bill.invoice_number}
                </p>
                <p className="text-2xl font-semibold tabular-nums">{money(outstandingPesewas / 100)}</p>
              </div>
              <Badge variant={outstandingPesewas === 0 ? "default" : "secondary"}>{settlementLabel}</Badge>
            </div>
            {financeHead && outstandingPesewas > 0 && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  paymentMutation.mutate();
                }}
              >
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="vendor-payment-vault">Source vault</FieldLabel>
                      <select
                        id="vendor-payment-vault"
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={vaultId}
                        onChange={(event) => setVaultId(event.target.value)}
                        required
                      >
                        <option value="">Choose funded vault</option>
                        {available.map((vault) => (
                          <option key={vault.id} value={vault.id}>
                            {vault.code} · {vault.name} ({money(Number(vault.balance))})
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="vendor-payment-amount">Confirmed amount (GHS)</FieldLabel>
                      <Input
                        id="vendor-payment-amount"
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="vendor-payment-date">Date paid</FieldLabel>
                      <Input
                        id="vendor-payment-date"
                        type="date"
                        min={bill.invoice_date}
                        max={new Date().toISOString().slice(0, 10)}
                        value={paidOn}
                        onChange={(event) => setPaidOn(event.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="vendor-payment-reference">Bank or cash reference</FieldLabel>
                      <Input
                        id="vendor-payment-reference"
                        minLength={4}
                        maxLength={200}
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        required
                      />
                    </Field>
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor="vendor-payment-proof">
                        Payment proof (PDF, JPEG or PNG, up to 5 MB)
                      </FieldLabel>
                      <Input
                        id="vendor-payment-proof"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                        required
                      />
                    </Field>
                  </div>
                  {available.length === 0 && (
                    <Alert>
                      <AlertTitle>No funded vault</AlertTitle>
                      <AlertDescription>
                        Management must set up a vault and Finance must record an evidenced opening before a payment can
                        be posted.
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button disabled={!paymentValid || paymentMutation.isPending}>
                    {paymentMutation.isPending ? "Recording…" : "Record confirmed payment"}
                  </Button>
                </FieldGroup>
              </form>
            )}
            <div className="flex flex-col gap-3">
              <h4 className="font-medium">Payment history</h4>
              {data.payments.length === 0 && (
                <p className="text-sm text-muted-foreground">No confirmed payments recorded.</p>
              )}
              {data.payments.map((payment) => {
                const reversal = data.reversals.find((item) => item.payment_id === payment.id);
                const vault = data.vaults.find((item) => item.id === payment.source_vault_id);
                return (
                  <div key={payment.id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium tabular-nums">{money(Number(payment.amount))}</p>
                      <Badge variant={reversal ? "outline" : "secondary"}>{reversal ? "Reversed" : "Posted"}</Badge>
                    </div>
                    <p className="break-words text-sm text-muted-foreground">
                      {payment.paid_on} · {payment.evidence_reference} · {vault?.code ?? "Former vault"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Recorded {new Date(payment.recorded_at).toLocaleString()} by {person(payment.recorded_by)}
                    </p>
                    {reversal && (
                      <p className="break-words text-sm">
                        Reversed {new Date(reversal.recorded_at).toLocaleString()} by {person(reversal.recorded_by)}:{" "}
                        {reversal.reason} ({reversal.evidence_reference})
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void downloadProof(payment)}>
                        Download proof
                      </Button>
                      {manager && !reversal && payment.recorded_by !== userId && (
                        <Button type="button" size="sm" variant="outline" onClick={() => setReverseId(payment.id)}>
                          Prepare reversal
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {manager && reverseId && (
              <form
                className="flex flex-col gap-3 rounded-lg border p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  reversalMutation.mutate();
                }}
              >
                <h4 className="font-medium">Reverse posted payment</h4>
                <p className="text-sm text-muted-foreground">
                  A reversal creates new opposite ledger lines. The original payment and proof remain in the history.
                </p>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="vendor-reversal-reference">Reversal evidence reference</FieldLabel>
                    <Input
                      id="vendor-reversal-reference"
                      value={reverseReference}
                      onChange={(event) => setReverseReference(event.target.value)}
                      minLength={4}
                      maxLength={200}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="vendor-reversal-reason">Reason</FieldLabel>
                    <Input
                      id="vendor-reversal-reason"
                      value={reverseReason}
                      onChange={(event) => setReverseReason(event.target.value)}
                      minLength={8}
                      maxLength={500}
                      required
                    />
                  </Field>
                </FieldGroup>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      reversalMutation.isPending ||
                      reverseReference.trim().length < 4 ||
                      reverseReason.trim().length < 8
                    }
                  >
                    {reversalMutation.isPending ? "Posting…" : "Post reversal"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setReverseId(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
