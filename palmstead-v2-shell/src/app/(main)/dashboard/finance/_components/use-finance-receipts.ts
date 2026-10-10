"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";
import { buildReceiptPdf } from "@/webnext/features/payments/lib/receiptPdf";
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
const RECEIPT_CONFIG_COLUMNS = "quote_company_name,quote_site_name,company_phone,company_email,company_tin,quote_footer_address,receipt_thanks_text,receipt_logo_image";

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
      const { data, error } = await sb.from("leads").select("name,contact,plot_type,grand_total,amt_paid").eq("id", leadId as string).single();
      if (error) throw error;
      const row = data as { name: string; contact: string | null; plot_type: string | null; grand_total: number | null; amt_paid: number | null };
      return { name: row.name, contact: row.contact, plotType: row.plot_type, grandTotal: Number(row.grand_total ?? 0), amtPaid: Number(row.amt_paid ?? 0) };
    },
  });
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
    status: p.status as WebnextPayment["status"],
  } as unknown as WebnextPayment;
}

function toWebnextLead(input: { name: string; contact: string | null; plotType: string | null; grandTotal: number; amtPaid: number }): Lead {
  return {
    name: input.name,
    contact: input.contact ?? "",
    plotType: input.plotType ?? "Full Plot",
    noPlots: 1,
    grandTotal: input.grandTotal,
    amtPaid: input.amtPaid,
  } as unknown as Lead;
}

async function ensureReceiptNumber(paymentId: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("ensure_receipt_number", { p_payment_id: paymentId, p_channel: "download" });
  if (error) throw error;
  return data as string;
}

export interface ReceiptLeadInfo {
  name: string;
  contact: string | null;
  plotType: string | null;
  grandTotal: number;
  amtPaid: number;
}

export function useDownloadReceipt(config: Config | undefined, issuerSignature: string | null | undefined, issuerName: string | null | undefined) {
  return useMutation({
    mutationFn: async ({ payment, lead }: { payment: Payment; lead: ReceiptLeadInfo | null }) => {
      if (!config) throw new Error("Receipt config not loaded yet");
      const receiptNumber = await ensureReceiptNumber(payment.id);
      const doc = buildReceiptPdf({
        clientName: payment.leadName,
        payment: toWebnextPayment(payment),
        lead: lead ? toWebnextLead(lead) : null,
        receiptNumber,
        config,
        issuerSignature: issuerSignature ?? null,
        issuerName: issuerName ?? null,
      });
      doc.save(`Receipt_${receiptNumber}.pdf`);
      return receiptNumber;
    },
  });
}

export function useIssueReceiptLink(config: Config | undefined, issuerSignature: string | null | undefined, issuerName: string | null | undefined, createdBy: string | undefined) {
  return useMutation({
    mutationFn: async ({ payment, lead }: { payment: Payment; lead: ReceiptLeadInfo | null }) => {
      if (!config) throw new Error("Receipt config not loaded yet");
      const sb = requireSupabase();
      const receiptNumber = await ensureReceiptNumber(payment.id);
      const doc = buildReceiptPdf({
        clientName: payment.leadName,
        payment: toWebnextPayment(payment),
        lead: lead ? toWebnextLead(lead) : null,
        receiptNumber,
        config,
        issuerSignature: issuerSignature ?? null,
        issuerName: issuerName ?? null,
      });
      const blob = doc.output("blob");
      const path = `${payment.id}/receipt-${Date.now()}.pdf`;
      const { error: uploadError } = await sb.storage.from("payment-receipts").upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
      const { data, error } = await sb.from("receipt_share_links").insert({ payment_id: payment.id, storage_path: path, created_by: createdBy ?? null }).select("token").single();
      if (error) throw error;
      return `${window.location.origin}/receipt/${(data as { token: string }).token}`;
    },
  });
}
