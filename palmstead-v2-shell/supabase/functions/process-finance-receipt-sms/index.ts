import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

type OutboxRow = {
  id: string;
  payment_id: string;
  lead_id: string;
  share_link_id: string;
  attempt_count: number;
};

type Delivery = {
  status: "accepted" | "failed" | "queued" | "needs_review" | "blocked";
  providerReference: string | null;
  error: string | null;
  providerStatus: Record<string, unknown> | null;
};

type LeadRow = {
  id: string;
  name: string;
  contact: string | null;
  plot_type: string | null;
  no_plots: number | null;
  grand_total: number | null;
  amt_paid: number | null;
  deleted_at: string | null;
};

type PaymentRow = {
  id: string;
  lead_id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  receipt_number: string | null;
  status: string;
  paid_after_approval: number | null;
  balance_after_approval: number | null;
  contract_total_at_approval: number | null;
  approval_snapshot_is_legacy: boolean;
};

type ReceiptConfig = {
  quote_company_name: string | null;
  quote_site_name: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_tin: string | null;
  quote_footer_address: string | null;
  receipt_thanks_text: string | null;
};

function normalizeGhanaPhone(value: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return digits;
  return null;
}

function ghs(value: number): string {
  return `GHS ${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cleanSmsText(value: string, maxLength: number): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function drawReceipt(payment: PaymentRow, lead: LeadRow, config: ReceiptConfig): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const navy: [number, number, number] = [11, 30, 61];
  const gold: [number, number, number] = [201, 162, 39];
  const gray: [number, number, number] = [92, 114, 128];
  const dark: [number, number, number] = [16, 24, 32];
  const line: [number, number, number] = [222, 230, 234];
  const left = 14;
  const right = w - 14;
  const company = config.quote_company_name || "Trulander JSF Limited";
  const site = config.quote_site_name || "Royal Palm Enclave, Tsopoli";
  const date = new Date(`${payment.payment_date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" });
  const hasSnapshot = !payment.approval_snapshot_is_legacy && payment.paid_after_approval != null && payment.balance_after_approval != null && payment.contract_total_at_approval != null;

  doc.setFillColor(250, 251, 252);
  doc.rect(0, 0, w, h, "F");
  doc.setFillColor(...navy);
  doc.rect(0, 0, w, 42, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 42, w, 1.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PAYMENT RECEIPT", left, 19);
  doc.setTextColor(232, 199, 102);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(company, left, 28);
  doc.setTextColor(205, 213, 222);
  doc.setFontSize(8);
  doc.text(`Receipt No. ${payment.receipt_number || "Pending"}`, left, 36);
  doc.text(date, right, 36, { align: "right" });

  let y = 56;
  if (config.company_tin) {
    doc.setTextColor(...gray);
    doc.setFontSize(8);
    doc.text(`Tax ID: ${config.company_tin}`, left, y);
    y += 9;
  }
  const col = (right - left - 10) / 2;
  const rightCol = left + col + 10;
  const field = (x: number, yy: number, label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...gray);
    doc.text(label.toUpperCase(), x, yy);
    doc.setFontSize(9.5);
    doc.setTextColor(...dark);
    const clipped = doc.splitTextToSize(value || "—", col - 2)[0] || "—";
    doc.text(clipped, x, yy + 5);
  };
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text("BILL TO", left, y);
  doc.text("ISSUED BY", rightCol, y);
  doc.setDrawColor(...gold);
  doc.line(left, y + 2, left + 18, y + 2);
  doc.line(rightCol, y + 2, rightCol + 18, y + 2);
  y += 10;
  field(left, y, "Client", lead.name);
  field(rightCol, y, "Company", company);
  field(left, y + 12, "Phone", lead.contact || "—");
  field(rightCol, y + 12, "Address", config.quote_footer_address || site);
  field(left, y + 24, "Plot", `${lead.plot_type || "Plot"} × ${lead.no_plots || 1}`);
  field(rightCol, y + 24, "Contact", config.company_phone || config.company_email || "—");

  y += 43;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text("PAYMENT DETAILS", left, y);
  doc.setDrawColor(...gold);
  doc.line(left, y + 2, left + 27, y + 2);
  y += 8;
  doc.setFillColor(...navy);
  doc.roundedRect(left, y, right - left, 9, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text("METHOD", left + 4, y + 6);
  doc.text("TRANSACTION REFERENCE", left + 53, y + 6);
  doc.text("AMOUNT RECEIVED", right - 4, y + 6, { align: "right" });
  y += 9;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...line);
  doc.roundedRect(left, y, right - left, 13, 1.5, 1.5, "FD");
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(doc.splitTextToSize(payment.payment_method || "—", 44)[0] || "—", left + 4, y + 8);
  doc.text(doc.splitTextToSize(payment.reference_number || "Not provided", 81)[0] || "Not provided", left + 53, y + 8);
  doc.setFont("helvetica", "bold");
  doc.text(ghs(payment.amount), right - 4, y + 8, { align: "right" });
  y += 21;

  if (hasSnapshot) {
    const total = Number(payment.contract_total_at_approval);
    const paid = Number(payment.paid_after_approval);
    const balance = Number(payment.balance_after_approval);
    const summaryX = left + 86;
    const summaryW = right - summaryX;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...line);
    doc.roundedRect(summaryX, y, summaryW, 34, 2, 2, "FD");
    const summary = [
      ["Contract total", ghs(total)],
      ["Paid to date", ghs(paid)],
      [balance <= 0 ? "Status" : "Remaining balance", balance <= 0 ? "PAID IN FULL" : ghs(balance)],
    ];
    summary.forEach(([label, value], i) => {
      const yy = y + 8 + i * 10;
      if (i) {
        doc.setDrawColor(...line);
        doc.line(summaryX + 3, yy - 5, summaryX + summaryW - 3, yy - 5);
      }
      doc.setFont("helvetica", i === 2 ? "bold" : "normal");
      doc.setFontSize(i === 2 ? 8.5 : 8);
      doc.setTextColor(i === 2 ? gold[0] : gray[0], i === 2 ? gold[1] : gray[1], i === 2 ? gold[2] : gray[2]);
      doc.text(label, summaryX + 4, yy);
      doc.setTextColor(...dark);
      doc.text(value, summaryX + summaryW - 4, yy, { align: "right" });
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...navy);
    doc.text("PAYMENT APPROVED", left, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    doc.text(`Payment date: ${date}`, left, y + 15);
    y += 42;
  } else {
    doc.setFillColor(255, 248, 232);
    doc.setDrawColor(232, 199, 102);
    doc.roundedRect(left, y, right - left, 18, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...navy);
    doc.text("PAYMENT APPROVED", left + 5, y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...gray);
    doc.text("Historic cumulative totals are unavailable; this receipt confirms only the payment shown above.", left + 5, y + 13);
    y += 26;
  }

  doc.setDrawColor(...gold);
  doc.setLineWidth(0.7);
  doc.line(left, y, left + 68, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.text("Palmstead Finance · Authorized", left, y + 5);
  const thanks = config.receipt_thanks_text || "Thank you. This receipt confirms that the payment above was received and applied to your account.";
  const noteY = Math.max(y + 18, h - 35);
  doc.setFillColor(...navy);
  doc.roundedRect(left, noteY - 4, right - left, 17, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(thanks, right - left - 12).slice(0, 2), left + 6, noteY + 2);
  doc.setFontSize(7);
  doc.setTextColor(...gray);
  doc.text(`${company} · ${site} · Keep this receipt for your records.`, left, h - 9);
  return new Uint8Array(doc.output("arraybuffer"));
}

function classifyProvider(httpStatus: number, body: unknown, recipient: string): Delivery {
  const response = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const rawData = response.data;
  const rows = Array.isArray(rawData) ? rawData : [rawData];
  const item = Array.isArray(rawData) ? rows.find((row) => {
    if (!row || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    return String(r.recipient ?? "").replace(/\D/g, "") === recipient;
  }) as Record<string, unknown> | undefined : (rawData && typeof rawData === "object" ? rawData as Record<string, unknown> : undefined);
  const referenceValue = item?.id ?? item?.message_id;
  const reference = typeof referenceValue === "string" && referenceValue.trim() ? referenceValue.trim() : null;
  const providerStatus = { httpStatus, status: response.status ?? null };
  if (httpStatus >= 200 && httpStatus < 300 && response.status === "success" && reference) {
    return { status: "accepted", providerReference: reference, error: null, providerStatus };
  }
  if (httpStatus === 429 && response.status !== "success" && !reference) {
    return { status: "queued", providerReference: null, error: "SMS provider rate limit reached. A retry is queued.", providerStatus };
  }
  if ([400, 401, 402, 403, 404, 413, 422].includes(httpStatus) && !reference) {
    return { status: "failed", providerReference: null, error: `SMS provider rejected the request (HTTP ${httpStatus}).`, providerStatus };
  }
  return { status: "needs_review", providerReference: reference, error: `SMS outcome is uncertain (HTTP ${httpStatus}); check provider history before retrying.`, providerStatus };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = request.headers.get("x-internal-secret");
  if (!projectUrl || !serviceKey || !token) return Response.json({ error: "Worker authorization is unavailable" }, { status: 401 });

  const supabase = createClient(projectUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: validToken, error: tokenError } = await supabase.rpc("verify_finance_receipt_sms_worker_token", { p_token: token });
  if (tokenError || validToken !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: rows, error: claimError } = await supabase.rpc("claim_finance_receipt_sms_outbox", { p_limit: 10 });
  if (claimError) return Response.json({ error: "Could not claim receipt messages" }, { status: 500 });

  let accepted = 0;
  let failed = 0;
  let blocked = 0;
  let needsReview = 0;
  let retryQueued = 0;
  let persistenceErrors = 0;
  const outboxRows = (rows ?? []) as OutboxRow[];
  for (const row of outboxRows) {
    const [{ data: payment }, { data: lead }, { data: link }, { data: config }] = await Promise.all([
      supabase.from("payments").select("id,lead_id,amount,payment_date,payment_method,reference_number,receipt_number,status,paid_after_approval,balance_after_approval,contract_total_at_approval,approval_snapshot_is_legacy").eq("id", row.payment_id).maybeSingle(),
      supabase.from("leads").select("id,name,contact,plot_type,no_plots,grand_total,amt_paid,deleted_at").eq("id", row.lead_id).maybeSingle(),
      supabase.from("receipt_share_links").select("id,token,storage_path").eq("id", row.share_link_id).maybeSingle(),
      supabase.from("app_config").select("quote_company_name,quote_site_name,company_phone,company_email,company_tin,quote_footer_address,receipt_thanks_text").limit(1).maybeSingle(),
    ]);

    let outcome: Delivery;
    let phone: string | null = null;
    let message = "";
    if (!payment || payment.status !== "approved" || !lead || lead.deleted_at || !link || !config) {
      outcome = { status: "blocked", providerReference: null, error: "The approved payment, active client, receipt link, or company receipt settings could not be rechecked.", providerStatus: null };
    } else if (!(payment as PaymentRow).receipt_number) {
      outcome = { status: "failed", providerReference: null, error: "The receipt number was not assigned to the approved payment.", providerStatus: null };
    } else {
      phone = normalizeGhanaPhone((lead as LeadRow).contact);
      if (!phone) {
        outcome = { status: "blocked", providerReference: null, error: "The client has no valid Ghana mobile number on file.", providerStatus: null };
      } else {
        const pdf = drawReceipt(payment as PaymentRow, lead as LeadRow, config as ReceiptConfig);
        const { error: uploadError } = await supabase.storage.from("payment-receipts").upload(link.storage_path, pdf, { contentType: "application/pdf", upsert: true });
        if (uploadError) {
          outcome = row.attempt_count >= 5
            ? { status: "failed", providerReference: null, error: "Receipt PDF could not be stored after five attempts.", providerStatus: { stage: "receipt_upload" } }
            : { status: "queued", providerReference: null, error: "Receipt PDF upload failed; a retry is queued.", providerStatus: { stage: "receipt_upload" } };
        } else {
          const origin = "https://palmstead-v2-shell.vercel.app";
          const receiptUrl = `${origin}/receipt/${link.token}`;
          const clientName = cleanSmsText((lead as LeadRow).name, 45) || "Client";
          message = `Hi ${clientName}, thank you for your payment of ${ghs(Number((payment as PaymentRow).amount))}. Receipt ${(payment as PaymentRow).receipt_number}: ${receiptUrl} - PEP Landbank`;
          const apiKey = Deno.env.get("ARKESEL_API_KEY");
          if (!apiKey) {
            outcome = { status: "failed", providerReference: null, error: "SMS provider is not configured on the server.", providerStatus: null };
          } else {
            try {
              const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
                method: "POST",
                headers: { "api-key": apiKey, "Content-Type": "application/json" },
                body: JSON.stringify({ sender: "Palmstead", message, recipients: [phone] }),
                signal: AbortSignal.timeout(12_000),
              });
              outcome = classifyProvider(response.status, await response.json().catch(() => null), phone);
            } catch {
              outcome = { status: "needs_review", providerReference: null, error: "SMS outcome is uncertain. Check provider history before retrying.", providerStatus: { stage: "provider_timeout" } };
            }
          }
        }
      }
    }

    if (outcome.status === "queued" && row.attempt_count >= 5) {
      outcome = { status: "failed", providerReference: null, error: "SMS or receipt generation failed after five attempts.", providerStatus: outcome.providerStatus };
    }
    const now = new Date().toISOString();
    const delayMs = Math.min(2 ** row.attempt_count * 60_000, 21_600_000);
    const { error: updateError } = await supabase.from("finance_receipt_sms_outbox").update({
      status: outcome.status,
      next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
      lease_until: null,
      provider_accepted_at: outcome.status === "accepted" ? now : null,
      provider_reference: outcome.providerReference,
      last_error: outcome.error,
      provider_status: outcome.providerStatus,
      updated_at: now,
    }).eq("id", row.id).eq("status", "sending").eq("attempt_count", row.attempt_count);
    if (updateError) { persistenceErrors += 1; continue; }

    if (outcome.status === "accepted") {
      accepted += 1;
      // The outbox is the source of truth; sms_log is a supplementary staff-visible history.
      const { error: logError } = await supabase.from("sms_log").insert({
        recipient: phone,
        message,
        trigger: "payment_thanks",
        sent_by: "finance-automation",
        status: "sent",
      });
      if (logError) persistenceErrors += 1;
      const { error: receiptLogError } = await supabase.from("receipt_log").insert({
        payment_id: row.payment_id,
        receipt_number: payment?.receipt_number,
        actor_kind: "staff",
        actor_key: null,
        actor_name: "Finance automation",
        channel: "sms",
      });
      if (receiptLogError) persistenceErrors += 1;
    } else if (outcome.status === "needs_review") needsReview += 1;
    else if (outcome.status === "queued") retryQueued += 1;
    else if (outcome.status === "blocked") blocked += 1;
    else failed += 1;
  }

  return Response.json({ claimed: outboxRows.length, providerAccepted: accepted, failed, blocked, needsReview, retryQueued, persistenceErrors }, { status: persistenceErrors ? 503 : 200 });
});

