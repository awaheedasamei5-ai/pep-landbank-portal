"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

import { VendorSettlementPanel } from "./vendor-settlement-panel";

type Vendor = {
  id: string;
  legal_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tax_reference: string | null;
  status: string;
  created_by: string;
  activated_at: string | null;
};
type Bill = {
  id: string;
  vendor_id: string;
  vendor_name_snapshot: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  category: string;
  description: string;
  amount: number;
  status: string;
  revision: number;
  created_by: string;
  approved_at: string | null;
};
type BillEvent = { id: number; actor_id: string; action: string; note: string; occurred_at: string };
type Person = { id: string; name: string };
type PaymentSummary = { id: string; bill_id: string; amount: number };
const money = (value: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value);
const validAmount = (value: string) => /^\d{1,12}(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;

export function VendorsPanel() {
  const profile = useAuthStore((state) => state.profile);
  const manager = profile?.role === "manager";
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const [legalName, setLegalName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [taxReference, setTaxReference] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [message, setMessage] = useState("");

  const query = useQuery({
    queryKey: ["finance-vendor-bills"],
    queryFn: async () => {
      const sb = requireSupabase();
      const auth = await sb.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error("Your session has expired. Please sign in again.");
      const [vendors, bills, roles, people] = await Promise.all([
        sb
          .from("finance_vendors")
          .select("id,legal_name,contact_name,contact_email,contact_phone,tax_reference,status,created_by,activated_at")
          .order("legal_name"),
        sb
          .from("finance_vendor_bills")
          .select(
            "id,vendor_id,vendor_name_snapshot,invoice_number,invoice_date,due_date,category,description,amount,status,revision,created_by,approved_at",
          )
          .order("due_date")
          .limit(200),
        sb
          .from("finance_role_assignments")
          .select("finance_role")
          .eq("profile_id", auth.data.user.id)
          .is("revoked_at", null),
        sb.from("profiles").select("id,name").eq("active", true),
      ]);
      for (const result of [vendors, bills, roles, people]) if (result.error) throw result.error;
      const approvedIds = (bills.data ?? []).filter((bill) => bill.status === "approved").map((bill) => bill.id);
      const payments = approvedIds.length
        ? await sb.from("finance_vendor_payments").select("id,bill_id,amount").in("bill_id", approvedIds)
        : { data: [] as PaymentSummary[], error: null };
      if (payments.error) throw payments.error;
      const paymentRows = (payments.data ?? []) as PaymentSummary[];
      const reversals = paymentRows.length
        ? await sb
            .from("finance_vendor_payment_reversals")
            .select("payment_id")
            .in(
              "payment_id",
              paymentRows.map((payment) => payment.id),
            )
        : { data: [] as { payment_id: string }[], error: null };
      if (reversals.error) throw reversals.error;
      const reversedIds = new Set((reversals.data ?? []).map((reversal) => reversal.payment_id));
      const paidByBill = new Map<string, number>();
      for (const payment of paymentRows) {
        if (reversedIds.has(payment.id)) continue;
        paidByBill.set(
          payment.bill_id,
          (paidByBill.get(payment.bill_id) ?? 0) + Math.round(Number(payment.amount) * 100),
        );
      }
      return {
        vendors: (vendors.data ?? []) as Vendor[],
        bills: (bills.data ?? []) as Bill[],
        roles: roles.data ?? [],
        people: (people.data ?? []) as Person[],
        userId: auth.data.user.id,
        paidByBill,
      };
    },
  });
  const history = useQuery({
    queryKey: ["finance-vendor-bill-history", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("finance_vendor_bill_events")
        .select("id,actor_id,action,note,occurred_at")
        .eq("bill_id", selectedId)
        .order("occurred_at");
      if (error) throw error;
      return (data ?? []) as BillEvent[];
    },
  });
  const mutation = useMutation({
    mutationFn: async (action: {
      kind: "vendor" | "activate" | "save" | "decide";
      id?: string;
      decision?: string;
      revision?: number;
    }) => {
      const sb = requireSupabase();
      const result = await (async () => {
        if (action.kind === "vendor")
          return sb.rpc("finance_create_vendor", {
            p_legal_name: legalName.trim(),
            p_contact_name: contactName.trim(),
            p_contact_email: contactEmail.trim(),
            p_contact_phone: contactPhone.trim(),
            p_tax_reference: taxReference.trim(),
          });
        if (action.kind === "activate") return sb.rpc("finance_activate_vendor", { p_vendor_id: action.id });
        if (action.kind === "save")
          return sb.rpc("finance_save_vendor_bill", {
            p_bill_id: editingId,
            p_vendor_id: vendorId,
            p_invoice_number: invoiceNumber.trim(),
            p_invoice_date: invoiceDate,
            p_due_date: dueDate,
            p_category: category.trim(),
            p_description: description.trim(),
            p_amount: Number(amount),
            p_expected_revision: editingRevision,
          });
        return sb.rpc("finance_decide_vendor_bill", {
          p_bill_id: action.id,
          p_action: action.decision,
          p_expected_revision: action.revision,
          p_note: decisionNote.trim(),
        });
      })();
      if (result.error) throw result.error;
      return { kind: action.kind, id: action.kind === "save" ? (result.data as string) : action.id };
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["finance-vendor-bills"] });
      await qc.invalidateQueries({ queryKey: ["finance-vendor-bill-history"] });
      if (result.kind === "vendor") setMessage("Vendor sent to the Head of Finance for activation.");
      else if (result.kind === "save") setMessage("Bill draft saved. Review it before submitting.");
      else setMessage("Decision recorded.");
      if (result.kind === "vendor") {
        setLegalName("");
        setContactName("");
        setContactEmail("");
        setContactPhone("");
        setTaxReference("");
      }
      if (result.kind === "save") {
        setSelectedId(result.id ?? null);
        setEditingId(null);
        setEditingRevision(null);
        setInvoiceNumber("");
        setInvoiceDate("");
        setDueDate("");
        setCategory("");
        setDescription("");
        setAmount("");
      }
      setDecisionNote("");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not complete the action."),
  });
  const data = query.data;
  const financeHead = data?.roles.some((role) => role.finance_role === "finance_head") ?? false;
  const clerk = manager || data?.roles.some((role) => role.finance_role === "finance_operator");
  const allowed = clerk || financeHead || data?.roles.some((role) => role.finance_role === "auditor");
  const selected = data?.bills.find((bill) => bill.id === selectedId) ?? null;
  const person = (id: string) => data?.people.find((item) => item.id === id)?.name ?? "Former staff member";
  const vendor = (id: string) => data?.vendors.find((item) => item.id === id)?.legal_name ?? "Vendor";
  const outstanding = (bill: Bill) =>
    Math.max(0, Math.round(Number(bill.amount) * 100) - (data?.paidByBill.get(bill.id) ?? 0));
  const approvedBills = data?.bills.filter((bill) => bill.status === "approved") ?? [];
  const openBills = approvedBills.filter((bill) => outstanding(bill) > 0);
  const overdueBills = openBills.filter((bill) => bill.due_date < new Date().toISOString().slice(0, 10));
  const decide = (decision: string) =>
    selected && mutation.mutate({ kind: "decide", id: selected.id, decision, revision: selected.revision });
  const startEdit = (bill: Bill) => {
    setSelectedId(bill.id);
    setEditingId(bill.id);
    setEditingRevision(bill.revision);
    setVendorId(bill.vendor_id);
    setInvoiceNumber(bill.invoice_number);
    setInvoiceDate(bill.invoice_date);
    setDueDate(bill.due_date);
    setCategory(bill.category);
    setDescription(bill.description);
    setAmount(String(bill.amount));
  };

  if (!query.isLoading && !allowed)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vendor payments</CardTitle>
          <CardDescription>Finance access is required to view vendor records and bills.</CardDescription>
        </CardHeader>
      </Card>
    );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Vendor payments</CardTitle>
          <CardDescription>
            Register vendors, review bills, and record confirmed disbursements with private proof and vault postings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {query.isLoading && <p className="text-sm text-muted-foreground">Loading vendors and bills…</p>}
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Active vendors</p>
              <p className="text-2xl font-semibold">
                {data?.vendors.filter((v) => v.status === "active").length ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Awaiting Finance review</p>
              <p className="text-2xl font-semibold">
                {data?.bills.filter((b) => b.status === "submitted").length ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Unsettled bills</p>
              <p className="text-2xl font-semibold">{data ? openBills.length : "—"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Overdue · outstanding</p>
              <p className="text-xl font-semibold tabular-nums">
                {data ? money(overdueBills.reduce((sum, bill) => sum + outstanding(bill), 0) / 100) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{overdueBills.length} unpaid bill(s) past due</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.4fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Vendor directory</CardTitle>
            <CardDescription>Management creates a vendor; a different Head of Finance activates it.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {manager && (
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate({ kind: "vendor" });
                }}
              >
                <div className="sm:col-span-2">
                  <Label htmlFor="vendor-legal-name">Legal name</Label>
                  <Input
                    id="vendor-legal-name"
                    value={legalName}
                    onChange={(event) => setLegalName(event.target.value)}
                    minLength={3}
                    maxLength={160}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="vendor-contact-name">Contact name</Label>
                  <Input
                    id="vendor-contact-name"
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    maxLength={120}
                  />
                </div>
                <div>
                  <Label htmlFor="vendor-contact-phone">Phone</Label>
                  <Input
                    id="vendor-contact-phone"
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    maxLength={40}
                  />
                </div>
                <div>
                  <Label htmlFor="vendor-contact-email">Email</Label>
                  <Input
                    id="vendor-contact-email"
                    type="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    maxLength={180}
                  />
                </div>
                <div>
                  <Label htmlFor="vendor-tax-reference">Tax reference</Label>
                  <Input
                    id="vendor-tax-reference"
                    value={taxReference}
                    onChange={(event) => setTaxReference(event.target.value)}
                    maxLength={80}
                  />
                </div>
                <Button
                  className="sm:col-span-2 sm:justify-self-start"
                  disabled={mutation.isPending || legalName.trim().length < 3}
                >
                  Create vendor
                </Button>
              </form>
            )}
            <div className="flex flex-col gap-2">
              {data?.vendors.length === 0 && (
                <p className="text-sm text-muted-foreground">No vendors registered yet.</p>
              )}
              {data?.vendors.map((item) => (
                <div
                  key={item.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{item.legal_name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {item.status} · {item.contact_name || "No contact"}
                    </p>
                  </div>
                  {financeHead && item.status === "pending" && item.created_by !== data.userId && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ kind: "activate", id: item.id })}
                    >
                      Activate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          {clerk && (
            <Card>
              <CardHeader>
                <CardTitle>{editingId ? "Edit bill draft" : "New vendor bill"}</CardTitle>
                <CardDescription>
                  Use the vendor’s invoice reference and date. Duplicate references for that vendor are blocked.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({ kind: "save" });
                  }}
                >
                  <div className="sm:col-span-2">
                    <Label htmlFor="bill-vendor">Vendor</Label>
                    <select
                      id="bill-vendor"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      required
                      value={vendorId}
                      onChange={(event) => setVendorId(event.target.value)}
                    >
                      <option value="">Choose active vendor</option>
                      {data?.vendors
                        .filter((item) => item.status === "active")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.legal_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="bill-invoice-number">Vendor invoice number</Label>
                    <Input
                      id="bill-invoice-number"
                      value={invoiceNumber}
                      onChange={(event) => setInvoiceNumber(event.target.value)}
                      minLength={2}
                      maxLength={80}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="bill-category">Expense category</Label>
                    <Input
                      id="bill-category"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      minLength={2}
                      maxLength={80}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="bill-invoice-date">Invoice date</Label>
                    <Input
                      id="bill-invoice-date"
                      type="date"
                      value={invoiceDate}
                      onChange={(event) => setInvoiceDate(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="bill-due-date">Due date</Label>
                    <Input
                      id="bill-due-date"
                      type="date"
                      min={invoiceDate}
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="bill-description">What was supplied</Label>
                    <textarea
                      id="bill-description"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                      rows={3}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      minLength={8}
                      maxLength={2000}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="bill-amount">Invoice total (GHS)</Label>
                    <Input
                      id="bill-amount"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      required
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      disabled={
                        mutation.isPending || !vendorId || !validAmount(amount) || description.trim().length < 8
                      }
                    >
                      {editingId ? "Save changes" : "Save bill draft"}
                    </Button>
                    {editingId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditingId(null);
                          setEditingRevision(null);
                        }}
                      >
                        Clear edit
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Bill register</CardTitle>
              <CardDescription>
                Review queue and due dates. Approved totals remain unsettled until payment evidence and vault posting
                are linked.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto">
              {!data?.bills.length && !query.isLoading && (
                <p className="text-sm text-muted-foreground">No vendor bills yet.</p>
              )}
              {data?.bills.map((bill) => (
                <button
                  type="button"
                  key={bill.id}
                  aria-current={selectedId === bill.id ? "page" : undefined}
                  onClick={() => setSelectedId(bill.id)}
                  className="flex min-w-0 flex-col gap-1 rounded-lg border p-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="flex flex-wrap justify-between gap-2 font-medium">
                    <span className="min-w-0 break-words">
                      {bill.vendor_name_snapshot || vendor(bill.vendor_id)} · {bill.invoice_number}
                    </span>
                    <span className="tabular-nums">{money(Number(bill.amount))}</span>
                  </span>
                  <span className="text-xs capitalize text-muted-foreground">
                    Due {bill.due_date} · {bill.status.replaceAll("_", " ")}
                    {bill.status === "approved" && ` · ${money(outstanding(bill) / 100)} outstanding`}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Bill detail</CardTitle>
              <CardDescription>Creator, Finance decision and recorded history.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!selected && <p className="text-sm text-muted-foreground">Select a bill to review its details.</p>}
              {selected && (
                <>
                  <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Vendor / invoice</p>
                      <p className="break-words font-medium">
                        {selected.vendor_name_snapshot || vendor(selected.vendor_id)} · {selected.invoice_number}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="font-medium capitalize">{selected.status}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Invoice / due</p>
                      <p>
                        {selected.invoice_date} / {selected.due_date}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-semibold tabular-nums">{money(Number(selected.amount))}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="whitespace-pre-wrap break-words">{selected.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {clerk && selected.created_by === data?.userId && selected.status === "draft" && (
                      <>
                        <Button variant="outline" onClick={() => startEdit(selected)}>
                          Edit draft
                        </Button>
                        <Button disabled={mutation.isPending} onClick={() => decide("submit")}>
                          Submit for Finance review
                        </Button>
                        <Button variant="outline" disabled={mutation.isPending} onClick={() => decide("cancel")}>
                          Cancel draft
                        </Button>
                      </>
                    )}
                    {financeHead && selected.created_by !== data?.userId && selected.status === "submitted" && (
                      <Button disabled={mutation.isPending} onClick={() => decide("approve")}>
                        Approve for payment
                      </Button>
                    )}
                  </div>
                  {financeHead && selected.created_by !== data?.userId && selected.status === "submitted" && (
                    <div className="flex flex-wrap gap-2">
                      <div className="min-w-[180px] flex-1">
                        <Label htmlFor="vendor-decision-note">Decision note</Label>
                        <Input
                          id="vendor-decision-note"
                          value={decisionNote}
                          onChange={(event) => setDecisionNote(event.target.value)}
                          maxLength={500}
                        />
                      </div>
                      <Button
                        className="self-end"
                        variant="destructive"
                        disabled={mutation.isPending || decisionNote.trim().length < 3}
                        onClick={() => decide("reject")}
                      >
                        Reject bill
                      </Button>
                    </div>
                  )}
                  <div>
                    <h3 className="mb-2 font-medium">History</h3>
                    <ol className="flex flex-col gap-2">
                      {history.data?.map((event) => (
                        <li key={event.id} className="rounded-md border p-3 text-sm">
                          <span className="font-medium capitalize">{event.action}</span>
                          <span className="ml-2 text-muted-foreground">
                            by {person(event.actor_id)} · {new Date(event.occurred_at).toLocaleString()}
                          </span>
                          {event.note && <p className="mt-1 whitespace-pre-wrap break-words">{event.note}</p>}
                        </li>
                      ))}
                    </ol>
                  </div>
                  {selected.status === "approved" && data && (
                    <VendorSettlementPanel
                      bill={selected}
                      vendorName={selected.vendor_name_snapshot || vendor(selected.vendor_id)}
                      financeHead={financeHead}
                      manager={manager}
                      userId={data.userId}
                      person={person}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
