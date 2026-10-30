"use client";

import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireSupabase } from "@/lib/supabase.client";

type Props = {
  bill: { id: string; revision: number; status: string; invoice_proof_path: string | null };
  canAttach: boolean;
};

const extension: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const bucket = "finance-vendor-invoices";

export function VendorInvoiceEvidence({ bill, canAttach }: Props) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const valid = file && file.size > 0 && file.size <= 5 * 1024 * 1024 && Boolean(extension[file.type]);

  async function attach() {
    if (!valid || !file || busy) return;
    setBusy(true);
    setMessage("");
    const sb = requireSupabase();
    const path = `${bill.id}/${crypto.randomUUID()}.${extension[file.type]}`;
    let linked = false;
    try {
      const uploaded = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw uploaded.error;
      const result = await sb.rpc("finance_attach_vendor_invoice", {
        p_bill_id: bill.id,
        p_path: path,
        p_expected_revision: bill.revision,
      });
      if (result.error) throw result.error;
      linked = true;
      setFile(null);
      setMessage("Supplier invoice attached. You can now submit the bill.");
      await qc.invalidateQueries({ queryKey: ["finance-vendor-bills"] });
      await qc.invalidateQueries({ queryKey: ["finance-vendor-bill-history", bill.id] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not attach the supplier invoice.");
    } finally {
      if (!linked) await sb.storage.from(bucket).remove([path]);
      setBusy(false);
    }
  }

  async function openInvoice() {
    if (!bill.invoice_proof_path) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await requireSupabase().storage.from(bucket).download(bill.invoice_proof_path);
      if (result.error) throw result.error;
      const url = URL.createObjectURL(result.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vendor-invoice-${bill.id}.${bill.invoice_proof_path.split(".").pop() ?? "pdf"}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not download the invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 rounded-lg border p-4">
      <p className="font-medium">Supplier invoice</p>
      <p className="text-sm text-muted-foreground">
        {bill.invoice_proof_path
          ? "Private invoice attached to this bill."
          : "Attach the vendor’s PDF or image before submitting for review."}
      </p>
      {bill.invoice_proof_path && (
        <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={openInvoice}>
          Download invoice
        </Button>
      )}
      {canAttach && !bill.invoice_proof_path && (
        <div className="mt-3 flex flex-col gap-2">
          <Label htmlFor={`invoice-${bill.id}`}>Invoice file (PDF, JPG or PNG; 5 MB maximum)</Label>
          <Input
            id={`invoice-${bill.id}`}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <Button className="self-start" size="sm" disabled={!valid || busy} onClick={attach}>
            {busy ? "Attaching…" : "Attach invoice"}
          </Button>
          {file && !valid && (
            <p role="alert" className="text-sm text-destructive">
              Choose a PDF, JPG or PNG up to 5 MB.
            </p>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="mt-2 break-words text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
