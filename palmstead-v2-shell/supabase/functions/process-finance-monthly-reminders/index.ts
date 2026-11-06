import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type OutboxRow = {
  id: string;
  schedule_id: string;
  installment_id: string;
  lead_id: string;
  idempotency_key: string;
  attempt_count: number;
  reminder_type: "due_soon" | "due_today" | "missed_payment";
};

type Delivery = {
  status: "accepted" | "failed" | "queued" | "needs_review" | "blocked";
  providerReference: string | null;
  error: string | null;
  providerStatus: Record<string, unknown> | null;
};

function normalizeGhanaPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return digits;
  return null;
}

function accraDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ghs(amount: number): string {
  return `GHS ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A plot allocated to this lead (Phase E's plots.lead_id) is the authoritative
// source; a schedule can exist before allocation, so leads.plot_type (set at
// quotation time) is the fallback. Real values are "Full Plot"/"Half Plot"/
// "Partial Plot" -- lowercased so it reads naturally mid-sentence.
function plotTypeLabel(allocatedPlotType: string | null | undefined, quotationPlotType: string | null | undefined): string {
  const raw = (allocatedPlotType || quotationPlotType || "").trim();
  return raw ? raw.toLowerCase() : "plot";
}

// {token} substitution against a DB-editable body_template (Outgoing SMS
// app, docs/plans/47); a fallback string is used if the row is missing so a
// deleted/misconfigured template row never breaks a real reminder send.
function renderTemplate(template: string | null | undefined, fallback: string, vars: Record<string, string>): string {
  const base = template && template.trim() ? template : fallback;
  return base.replace(/\{(\w+)\}/g, (_match, key: string) => (key in vars ? vars[key] : `{${key}}`));
}

function classifyProvider(httpStatus: number, body: unknown, recipient: string): Delivery {
  const response = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawData = response.data;
  const rows = Array.isArray(rawData) ? rawData : [rawData];
  let item: Record<string, unknown> | undefined;
  if (Array.isArray(rawData)) {
    item = rows.find(
      (row) =>
        row &&
        typeof row === "object" &&
        String((row as Record<string, unknown>).recipient ?? "").replace(/\D/g, "") === recipient,
    ) as Record<string, unknown> | undefined;
  } else if (rawData && typeof rawData === "object") {
    item = rawData as Record<string, unknown>;
  }
  const value = item?.id ?? item?.message_id;
  const reference = typeof value === "string" && value.trim() ? value.trim() : null;
  const providerStatus = { httpStatus, status: response.status ?? null };
  if (httpStatus >= 200 && httpStatus < 300 && response.status === "success" && reference) {
    return { status: "accepted", providerReference: reference, error: null, providerStatus };
  }
  if (httpStatus === 429 && response.status !== "success" && !reference) {
    return {
      status: "queued",
      providerReference: null,
      error: "SMS provider rate limit reached. A retry is queued.",
      providerStatus,
    };
  }
  if ([400, 401, 402, 403, 404, 413, 422].includes(httpStatus) && !reference) {
    return {
      status: "failed",
      providerReference: null,
      error: `SMS provider rejected the request (HTTP ${httpStatus}).`,
      providerStatus,
    };
  }
  return {
    status: "needs_review",
    providerReference: reference,
    error: "SMS provider response was ambiguous. Check provider history before retrying.",
    providerStatus,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const token = request.headers.get("x-internal-secret");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !serviceKey)
    return Response.json({ error: "Worker authorization is unavailable" }, { status: 401 });

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: validToken, error: tokenError } = await supabase.rpc("verify_finance_monthly_reminder_worker_token", {
    p_token: token,
  });
  if (tokenError || validToken !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: templateRows } = await supabase
    .from("sms_templates")
    .select("kind,body_template")
    .in("kind", ["payment_due_soon", "payment_due_today", "payment_missed_first", "payment_missed_escalated"]);
  const templates = new Map((templateRows ?? []).map((row) => [row.kind as string, row.body_template as string | null]));

  const apiKey = Deno.env.get("ARKESEL_API_KEY");
  const { data: rows, error: claimError } = await supabase.rpc("claim_finance_monthly_payment_reminders", {
    p_limit: 10,
  });
  if (claimError) return Response.json({ error: "Could not claim queued reminders" }, { status: 500 });

  let accepted = 0;
  let failed = 0;
  let needsReview = 0;
  let retryQueued = 0;
  let blocked = 0;
  let persistenceErrors = 0;
  for (const row of (rows ?? []) as OutboxRow[]) {
    const reminderType =
      row.reminder_type === "missed_payment" ? "missed_payment" : row.reminder_type === "due_today" ? "due_today" : "due_soon";
    const [
      { data: lead, error: leadError },
      { data: schedule, error: scheduleError },
      { data: installment, error: installmentError },
    ] = await Promise.all([
      supabase.from("leads").select("name,contact,deleted_at,plot_type,sms_opt_out").eq("id", row.lead_id).maybeSingle(),
      supabase
        .from("finance_monthly_payment_schedules")
        .select("status,sms_reminders_enabled,sms_consent_recorded_at,sms_consent_phone")
        .eq("id", row.schedule_id)
        .maybeSingle(),
      supabase
        .from("finance_monthly_payment_installments")
        .select("due_date,due_amount,paid_amount,status,reconciliation_hold")
        .eq("id", row.installment_id)
        .maybeSingle(),
    ]);

    const today = accraDate(new Date());
    const dueDateValid =
      !!installment &&
      (reminderType === "due_soon"
        ? new Date(`${installment.due_date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime() ===
          7 * 86_400_000
        : reminderType === "due_today"
          ? installment.due_date === today
          : new Date(`${installment.due_date}T00:00:00Z`).getTime() < new Date(`${today}T00:00:00Z`).getTime());

    let outcome: Delivery;
    if (leadError || scheduleError || installmentError) {
      outcome = {
        status: "needs_review",
        providerReference: null,
        error: "Schedule delivery details could not be rechecked.",
        providerStatus: null,
      };
    } else if (
      !lead ||
      lead.deleted_at ||
      lead.sms_opt_out ||
      !schedule ||
      schedule.status !== "active" ||
      !schedule.sms_reminders_enabled ||
      !schedule.sms_consent_recorded_at ||
      normalizeGhanaPhone(lead.contact) !== schedule.sms_consent_phone ||
      !installment ||
      !["scheduled", "part_paid"].includes(installment.status) ||
      installment.reconciliation_hold ||
      !dueDateValid
    ) {
      const { error } = await supabase
        .from("finance_monthly_payment_reminder_outbox")
        .update({
          status: "cancelled",
          lease_until: null,
          last_error: "The schedule changed, the installment was paid, or SMS permission was withdrawn.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "sending")
        .eq("attempt_count", row.attempt_count);
      if (error) persistenceErrors += 1;
      continue;
    } else {
      const phone = normalizeGhanaPhone(lead.contact);
      if (!phone) {
        outcome = {
          status: "blocked",
          providerReference: null,
          error: "Client mobile number is missing or invalid.",
          providerStatus: null,
        };
      } else if (!apiKey) {
        outcome = {
          status: "failed",
          providerReference: null,
          error: "SMS provider is not configured on the server.",
          providerStatus: null,
        };
      } else {
        const { data: plotRow } = await supabase
          .from("plots")
          .select("plot_type")
          .eq("lead_id", row.lead_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const plotLabel = plotTypeLabel(plotRow?.plot_type, lead.plot_type);

        const name = String(lead.name || "Client")
          .replace(/[\r\n\t]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60);

        let message: string;
        if (reminderType === "missed_payment") {
          const { data: overdueRows } = await supabase
            .from("finance_monthly_payment_installments")
            .select("due_date,due_amount,paid_amount")
            .eq("schedule_id", row.schedule_id)
            .in("status", ["scheduled", "part_paid"])
            .lt("due_date", today)
            .order("due_date", { ascending: true });
          const overdue = (overdueRows ?? []).map((r) => ({
            amount: Math.max(0, Number(r.due_amount) - Number(r.paid_amount)),
            due_date: r.due_date as string,
          }));
          if (overdue.length >= 2) {
            const shown = overdue.slice(0, 6);
            const list = shown.map((item) => `${ghs(item.amount)} (due ${dateLabel(item.due_date)})`).join("; ");
            const more = overdue.length > shown.length ? `, and ${overdue.length - shown.length} more` : "";
            message = renderTemplate(
              templates.get("payment_missed_escalated"),
              `Hello {name}, we hope you are doing well. Our records show the following payments for your {plotType} at the Royal Palm Enclave are still outstanding: {overdueList}. We kindly ask that you settle these at your earliest convenience, as continued non-payment may attract a penalty under your agreement. Please do let us know if any of these have already been paid. - Trulander JSF`,
              { name, plotType: plotLabel, overdueList: `${list}${more}` },
            );
          } else {
            const outstanding = Math.max(0, Number(installment.due_amount) - Number(installment.paid_amount));
            message = renderTemplate(
              templates.get("payment_missed_first"),
              `Hello {name}, we hope you are doing well. Our records show that your monthly payment of {amount} for your {plotType} at the Royal Palm Enclave, due on {dueDate}, has not yet been received. Kindly settle this at your earliest convenience, or let us know if you have already made this payment. - Trulander JSF`,
              { name, amount: ghs(outstanding), plotType: plotLabel, dueDate: dateLabel(installment.due_date) },
            );
          }
        } else if (reminderType === "due_today") {
          const outstanding = Math.max(0, Number(installment.due_amount) - Number(installment.paid_amount));
          message = renderTemplate(
            templates.get("payment_due_today"),
            `Hello {name}, your monthly payment of {amount} for your {plotType} at the Royal Palm Enclave is due today, {dueDate}. Kindly arrange payment at your earliest convenience. - Trulander JSF`,
            { name, amount: ghs(outstanding), plotType: plotLabel, dueDate: dateLabel(installment.due_date) },
          );
        } else {
          const outstanding = Math.max(0, Number(installment.due_amount) - Number(installment.paid_amount));
          message = renderTemplate(
            templates.get("payment_due_soon"),
            `Hello {name}, your monthly payment of {amount} for your {plotType} at the Royal Palm Enclave is due on {dueDate}. We would appreciate it if you could make arrangements ahead of the due date. Thank you. - Trulander JSF`,
            { name, amount: ghs(outstanding), plotType: plotLabel, dueDate: dateLabel(installment.due_date) },
          );
        }

        try {
          const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
            method: "POST",
            headers: { "api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ sender: "Palmstead", message, recipients: [phone] }),
            signal: AbortSignal.timeout(12_000),
          });
          const body: unknown = await response.json().catch(() => null);
          outcome = classifyProvider(response.status, body, phone);
        } catch {
          outcome = {
            status: "needs_review",
            providerReference: null,
            error: "SMS outcome is uncertain. Check provider history before retrying.",
            providerStatus: null,
          };
        }
      }
    }

    if (outcome.status === "queued" && row.attempt_count >= 5) {
      outcome = {
        status: "failed",
        providerReference: null,
        error: "SMS provider rate limit persisted after five attempts.",
        providerStatus: outcome.providerStatus,
      };
    }
    const retrySeconds = Math.min(2 ** row.attempt_count * 60, 21_600);
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("finance_monthly_payment_reminder_outbox")
      .update({
        status: outcome.status,
        next_attempt_at: new Date(Date.now() + retrySeconds * 1000).toISOString(),
        provider_accepted_at: outcome.status === "accepted" ? now : null,
        lease_until: null,
        provider_reference: outcome.providerReference,
        last_error: outcome.error,
        provider_status: outcome.providerStatus,
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("status", "sending")
      .eq("attempt_count", row.attempt_count);
    if (updateError) {
      persistenceErrors += 1;
      continue;
    }
    if (outcome.status === "accepted") accepted += 1;
    else if (outcome.status === "needs_review") needsReview += 1;
    else if (outcome.status === "queued") retryQueued += 1;
    else if (outcome.status === "blocked") blocked += 1;
    else failed += 1;
  }

  return Response.json({
    claimed: (rows ?? []).length,
    providerAccepted: accepted,
    failed,
    needsReview,
    retryQueued,
    blocked,
    persistenceErrors,
  });
});
