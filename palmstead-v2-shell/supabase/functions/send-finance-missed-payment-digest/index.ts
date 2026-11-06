import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type DigestClient = {
  lead_id: string;
  name: string;
  outstanding: number;
  due_date: string;
  plot_type: string | null;
};

type DigestRecipient = {
  agent_key: string;
  name: string;
  phone: string | null;
};

function normalizeGhanaPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return digits;
  return null;
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

// Deep-links straight at the Payments tab's Log Payment dialog (see
// payments-panel.tsx's `action=log-payment` handling); a staff member who
// isn't already signed in is bounced through /auth/v1/login?redirect=... by
// AuthGate and still lands here once they do (login-form.tsx's redirectTo).
const LOG_PAYMENT_LINK = "https://palmstead-v2-shell.vercel.app/dashboard/finance?tab=payments&action=log-payment";

// {token} substitution against a DB-editable body_template (Outgoing SMS
// app, docs/plans/47); a fallback string is used if the row is missing so a
// deleted/misconfigured template row never breaks the real staff digest.
function renderTemplate(template: string | null | undefined, fallback: string, vars: Record<string, string>): string {
  const base = template && template.trim() ? template : fallback;
  return base.replace(/\{(\w+)\}/g, (_match, key: string) => (key in vars ? vars[key] : `{${key}}`));
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

  const apiKey = Deno.env.get("ARKESEL_API_KEY");
  const todayAccra = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Accra" }).format(new Date());

  const { data: claimed, error: claimError } = await supabase.rpc("claim_finance_missed_payment_digest", {
    p_date: todayAccra,
  });
  if (claimError) return Response.json({ error: "Could not claim today's digest" }, { status: 500 });
  if (claimed !== true) return Response.json({ skipped: "Today's digest was already sent." });

  const [{ data: clients, error: clientsError }, { data: recipients, error: recipientsError }, { data: templateRow }, { data: configRow }] =
    await Promise.all([
      supabase.rpc("compute_finance_missed_payment_digest_clients"),
      supabase.rpc("list_finance_missed_payment_digest_recipients"),
      supabase.from("sms_templates").select("body_template").eq("kind", "payment_staff_digest").maybeSingle(),
      supabase.from("app_config").select("sms_qa_backloop_phone").limit(1).maybeSingle(),
    ]);
  if (clientsError || recipientsError) return Response.json({ error: "Could not compute today's digest" }, { status: 500 });

  const clientRows = (clients ?? []) as DigestClient[];
  const recipientRows = ((recipients ?? []) as DigestRecipient[]).filter((r) => normalizeGhanaPhone(r.phone));

  if (clientRows.length === 0) {
    await supabase.rpc("record_finance_missed_payment_digest_counts", {
      p_date: todayAccra,
      p_recipients: 0,
      p_clients: 0,
    });
    return Response.json({ skipped: "No clients are overdue today -- nothing to warn staff about." });
  }

  const shown = clientRows.slice(0, 10);
  const list = shown
    .map((c) => `${c.name} - ${ghs(c.outstanding)} (${(c.plot_type || "plot").toLowerCase()}, overdue since ${dateLabel(c.due_date)})`)
    .join("; ");
  const more = clientRows.length > shown.length ? ` and ${clientRows.length - shown.length} more` : "";
  const message = renderTemplate(
    templateRow?.body_template as string | undefined,
    `Palmstead will be sending payment reminders today to: {clientList}. If any of them have already paid and it hasn't been logged yet, please log it now to avoid an incorrect reminder going out: {logPaymentLink}`,
    { clientList: `${list}${more}`, logPaymentLink: LOG_PAYMENT_LINK },
  );

  let accepted = 0;
  let failed = 0;
  // Temporary QA backloop (user request, 2026-11-06): also CC this real
  // phone on every real digest send, so wording/data can be refined by
  // watching real reports land. Set app_config.sms_qa_backloop_phone back
  // to null to remove -- not counted in accepted/failed, it's a copy, not
  // a real recipient.
  const qaPhone = normalizeGhanaPhone((configRow as { sms_qa_backloop_phone?: string | null } | null)?.sms_qa_backloop_phone);
  const sendList = qaPhone && !recipientRows.some((r) => normalizeGhanaPhone(r.phone) === qaPhone)
    ? [...recipientRows, { agent_key: "_qa_backloop", name: "QA backloop", phone: qaPhone }]
    : recipientRows;
  if (apiKey && sendList.length > 0) {
    for (const recipient of sendList) {
      const phone = normalizeGhanaPhone(recipient.phone);
      if (!phone) continue;
      try {
        const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ sender: "Palmstead", message, recipients: [phone] }),
          signal: AbortSignal.timeout(12_000),
        });
        const body: unknown = await response.json().catch(() => null);
        const ok =
          response.status >= 200 &&
          response.status < 300 &&
          body &&
          typeof body === "object" &&
          (body as Record<string, unknown>).status === "success";
        if (recipient.agent_key !== "_qa_backloop") {
          if (ok) accepted += 1;
          else failed += 1;
        }
      } catch {
        if (recipient.agent_key !== "_qa_backloop") failed += 1;
      }
    }
  }

  await supabase.rpc("record_finance_missed_payment_digest_counts", {
    p_date: todayAccra,
    p_recipients: accepted,
    p_clients: clientRows.length,
  });

  return Response.json({
    digestDate: todayAccra,
    clientCount: clientRows.length,
    recipientsAttempted: recipientRows.length,
    accepted,
    failed,
  });
});
