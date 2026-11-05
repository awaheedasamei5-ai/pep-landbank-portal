"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";
import { buildReceiptPdf } from "@/webnext/features/payments/lib/receiptPdf";
import { useLogDownload } from "@/webnext/shared/hooks/useLogDownload";
import type { Config, Lead, Payment as WebnextPayment } from "@/webnext/types/domain";

import type { Payment } from "./use-finance-payments";

// Real receipt generation for Finance > Payments (the gap flagged after
// the fact: V1's real Log Payment offers "Download receipt PDF / Send via
// WhatsApp / Send via Email" immediately after every approval -- see
// index.html's offerSendReceipt()/buildReceiptPDF()). The branded PDF
// itself and the real share-link infrastructure (ensure_receipt_number
// RPC, the 'payment-receipts' Storage bucket, receipt_share_links table,
// the get-receipt edge function) were all already built and live from the
// web-next phase -- this just wires this shell's own real Supabase client
// and auth store into that existing infrastructure, since web-next's own
// DataSource/useSessionStore abstractions don't exist here.
const RECEIPT_CONFIG_COLUMNS =
  "quote_company_name,quote_site_name,company_phone,company_email,company_tin,quote_footer_address,receipt_thanks_text,receipt_logo_image";

async function fetchReceiptConfig(): Promise<Config> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("app_config").select(RECEIPT_CONFIG_COLUMNS).limit(1).single();
  if (error) throw error;
  const row = data as {
    quote_company_name: string | null;
    quote_site_name: string | null;
    company_phone: string | null;
    company_email: string | null;
    company_tin: string | null;
    quote_footer_address: string | null;
    receipt_thanks_text: string | null;
    receipt_logo_image: string | null;
  };
  return {
    quoteCompanyName: row.quote_company_name ?? "",
    quoteSiteName: row.quote_site_name ?? "",
    companyPhone: row.company_phone ?? "",
    companyEmail: row.company_email ?? "",
    companyTin: row.company_tin ?? "",
    quoteFooterAddress: row.quote_footer_address ?? "",
    receiptThanksText: row.receipt_thanks_text ?? "",
    receiptLogoImage: row.receipt_logo_image,
  } as unknown as Config;
}

export function useReceiptConfig() {
  return useQuery({ queryKey: ["receipt-config"], queryFn: fetchReceiptConfig });
}

// Always re-fetched fresh (not reused from a stale selectedLead/list row)
// so the receipt's "paid to date" / "balance remaining" reflects the
// lead's real amt_paid right after approve_payment() updated it.
export function useReceiptLeadInfo(leadId: string | null) {
  return useQuery({
    queryKey: ["receipt-lead-info", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<ReceiptLeadInfo> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("leads")
        .select("name,contact,plot_type,grand_total,amt_paid,client_no")
        .eq("id", leadId as string)
        .single();
      if (error) throw error;
      const row = data as {
        name: string;
        contact: string | null;
        plot_type: string | null;
        grand_total: number | null;
        amt_paid: number | null;
        client_no: string | null;
      };
      return {
        id: leadId as string,
        name: row.name,
        contact: row.contact,
        plotType: row.plot_type,
        grandTotal: Number(row.grand_total ?? 0),
        amtPaid: Number(row.amt_paid ?? 0),
        clientNo: row.client_no,
      };
    },
  });
}

// Real itemized payment history for the receipt's "PAYMENT HISTORY" table
// (Phase E, docs/plans/43 §4.3) -- approved payments only, same table
// usePayments() reads from, just scoped to one lead and the few columns
// the PDF actually renders.
async function fetchApprovedPaymentHistory(leadId: string): Promise<WebnextPayment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("payments")
    .select("id,lead_id,amount,payment_method,reference_number,receipt_number,status,payment_date")
    .eq("lead_id", leadId)
    .eq("status", "approved")
    .order("payment_date", { ascending: true });
  if (error) throw error;
  return (
    data as {
      id: string;
      lead_id: string;
      amount: number;
      payment_method: string | null;
      reference_number: string | null;
      receipt_number: string | null;
      status: string;
      payment_date: string;
    }[]
  ).map(
    (row) =>
      ({
        id: row.id,
        leadId: row.lead_id,
        agentKey: "",
        amount: Number(row.amount),
        date: row.payment_date,
        paymentMethod: row.payment_method as WebnextPayment["paymentMethod"],
        referenceNumber: row.reference_number ?? undefined,
        receiptNumber: row.receipt_number,
        status: row.status as WebnextPayment["status"],
      }) as WebnextPayment,
  );
}

function toWebnextPayment(p: Payment): WebnextPayment {
  return {
    id: p.id,
    leadId: p.leadId,
    agentKey: p.agentKey,
    amount: p.amount,
    date: p.paymentDate,
    clientName: p.leadName,
    paymentMethod: p.paymentMethod as WebnextPayment["paymentMethod"],
    referenceNumber: p.referenceNumber,
    status: p.status as WebnextPayment["status"],
  } as unknown as WebnextPayment;
}

function toWebnextLead(input: {
  id: string;
  name: string;
  contact: string | null;
  plotType: string | null;
  grandTotal: number;
  amtPaid: number;
  clientNo: string | null;
}): Lead {
  return {
    id: input.id,
    name: input.name,
    contact: input.contact ?? "",
    plotType: input.plotType ?? "Full Plot",
    noPlots: 1,
    grandTotal: input.grandTotal,
    amtPaid: input.amtPaid,
    clientNo: input.clientNo,
  } as unknown as Lead;
}

async function ensureReceiptNumber(paymentId: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("ensure_receipt_number", { p_payment_id: paymentId, p_channel: "download" });
  if (error) throw error;
  return data as string;
}

export interface ReceiptLeadInfo {
  id: string;
  name: string;
  contact: string | null;
  plotType: string | null;
  grandTotal: number;
  amtPaid: number;
  clientNo: string | null;
}

export function useDownloadReceipt(
  config: Config | undefined,
  issuerSignature: string | null | undefined,
  issuerName: string | null | undefined,
) {
  const logDownload = useLogDownload();
  return useMutation({
    mutationFn: async ({ payment, lead }: { payment: Payment; lead: ReceiptLeadInfo | null }) => {
      if (!config) throw new Error("Receipt config not loaded yet");
      const receiptNumber = await ensureReceiptNumber(payment.id);
      const paymentHistory = lead ? await fetchApprovedPaymentHistory(lead.id) : [];
      const doc = buildReceiptPdf({
        clientName: payment.clientName ?? payment.leadName,
        payment: toWebnextPayment(payment),
        lead: lead ? toWebnextLead(lead) : null,
        receiptNumber,
        config,
        paidAsOf: payment.approvalSnapshotIsLegacy ? null : payment.paidAfterApproval,
        balanceAsOf: payment.approvalSnapshotIsLegacy ? null : payment.balanceAfterApproval,
        contractTotalAsOf: payment.approvalSnapshotIsLegacy ? null : payment.contractTotalAtApproval,
        issuerSignature: issuerSignature ?? null,
        issuerName: issuerName ?? null,
        paymentHistory,
      });
      const filename = `Receipt_${receiptNumber}.pdf`;
      doc.save(filename);
      logDownload(filename, "pdf", doc.output("datauristring"));
      return receiptNumber;
    },
  });
}

export function useIssueReceiptLink(
  config: Config | undefined,
  issuerSignature: string | null | undefined,
  issuerName: string | null | undefined,
  createdBy: string | undefined,
) {
  return useMutation({
    mutationFn: async ({ payment, lead }: { payment: Payment; lead: ReceiptLeadInfo | null }) => {
      if (!config) throw new Error("Receipt config not loaded yet");
      const sb = requireSupabase();
      const receiptNumber = await ensureReceiptNumber(payment.id);
      const paymentHistory = lead ? await fetchApprovedPaymentHistory(lead.id) : [];
      const doc = buildReceiptPdf({
        clientName: payment.clientName ?? payment.leadName,
        payment: toWebnextPayment(payment),
        lead: lead ? toWebnextLead(lead) : null,
        receiptNumber,
        config,
        paidAsOf: payment.approvalSnapshotIsLegacy ? null : payment.paidAfterApproval,
        balanceAsOf: payment.approvalSnapshotIsLegacy ? null : payment.balanceAfterApproval,
        contractTotalAsOf: payment.approvalSnapshotIsLegacy ? null : payment.contractTotalAtApproval,
        issuerSignature: issuerSignature ?? null,
        issuerName: issuerName ?? null,
        paymentHistory,
      });
      const blob = doc.output("blob");
      const path = `${payment.id}/receipt-${Date.now()}.pdf`;
      const { error: uploadError } = await sb.storage
        .from("payment-receipts")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
      const { data, error } = await sb
        .from("receipt_share_links")
        .insert({ payment_id: payment.id, storage_path: path, created_by: createdBy ?? null })
        .select("token")
        .single();
      if (error) throw error;
      return `${window.location.origin}/receipt/${(data as { token: string }).token}`;
    },
  });
}

