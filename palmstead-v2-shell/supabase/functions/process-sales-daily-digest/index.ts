import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type DeliveryRow = { id: string; run_id: string; recipient_id: string; attempt_count: number };
type DeliveryStatus = "accepted" | "queued" | "failed" | "needs_review" | "blocked";
type Outcome = { status: DeliveryStatus; reference: string | null; error: string | null };

function phoneNumber(value: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  return /^233\d{9}$/.test(digits) ? digits : null;
}

function providerOutcome(httpStatus: number, body: unknown, recipient: string): Outcome {
  const response = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const raw = response.data;
  const item = Array.isArray(raw)
    ? raw.find((value) => value && typeof value === "object" && String((value as Record<string, unknown>).recipient ?? "").replace(/\D/g, "") === recipient)
    : raw;
  const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
  const reference = String(record.id ?? record.message_id ?? "").trim() || null;
  if (httpStatus >= 200 && httpStatus < 300 && response.status === "success" && reference)
    return { status: "accepted", reference, error: null };
  if (httpStatus === 429 && !reference)
    return { status: "queued", reference: null, error: "SMS provider rate limit reached. A retry is queued." };
  if ([400, 401, 402, 403, 404, 413, 422].includes(httpStatus) && !reference)
    return { status: "failed", reference: null, error: `SMS provider rejected the request (HTTP ${httpStatus}).` };
  return { status: "needs_review", reference, error: "SMS outcome uncertain; check Arkesel history before retrying." };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = request.headers.get("x-internal-secret");
  if (!url || !key || !token) return Response.json({ error: "Worker authorization unavailable" }, { status: 401 });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authorized, error: authError } = await supabase.rpc("verify_sales_daily_digest_worker_token", { p_token: token });
  if (authError || authorized !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: settings, error: settingsError } = await supabase.from("sales_daily_digest_settings").select("enabled").eq("singleton", true).single();
  if (settingsError || !settings) return Response.json({ error: "Digest settings unavailable" }, { status: 503 });
  if (!settings.enabled) return Response.json({ accepted: 0, disabled: true });
  const { data: claimed, error: claimError } = await supabase.rpc("claim_sales_daily_digest_deliveries", { p_limit: 10 });
  if (claimError) return Response.json({ error: "Could not claim digest deliveries" }, { status: 500 });
  const apiKey = Deno.env.get("ARKESEL_API_KEY");
  // Temporary QA backloop (user request, 2026-11-06): also send a copy of
  // every real Management digest to this real phone, so wording/data can
  // be refined by watching real reports land. Set
  // app_config.sms_qa_backloop_phone back to null to remove.
  const { data: qaConfigRow } = await supabase.from("app_config").select("sms_qa_backloop_phone").limit(1).maybeSingle();
  const qaPhoneRaw = (qaConfigRow as { sms_qa_backloop_phone?: string | null } | null)?.sms_qa_backloop_phone ?? null;
  const qaDigits = (qaPhoneRaw ?? "").replace(/\D/g, "");
  const qaPhone = /^0\d{9}$/.test(qaDigits) ? `233${qaDigits.slice(1)}` : /^233\d{9}$/.test(qaDigits) ? qaDigits : null;
  let accepted = 0;
  let blocked = 0;
  let failed = 0;
  let needsReview = 0;
  let persistenceErrors = 0;
  for (const row of (claimed ?? []) as DeliveryRow[]) {
    const [{ data: recipient, error: recipientError }, { data: run, error: runError }] = await Promise.all([
      supabase.from("profiles").select("role,active,phone").eq("id", row.recipient_id).maybeSingle(),
      supabase.from("sales_daily_digest_runs").select("id,local_date,kind").eq("id", row.run_id).maybeSingle(),
    ]);
    let outcome: Outcome;
    const phone = phoneNumber(recipient?.phone ?? null);
    if (recipientError || runError || !run || !recipient || !recipient.active || recipient.role !== "manager") {
      outcome = { status: "blocked", reference: null, error: "The report or active Management recipient is unavailable." };
    } else if (!phone) {
      outcome = { status: "blocked", reference: null, error: "Management has no valid Ghana mobile number in biodata." };
    } else if (!apiKey) {
      outcome = { status: "failed", reference: null, error: "Arkesel is not configured on the server." };
    } else {
      const origin = "https://palmstead-v2-shell.vercel.app";
      const kind = run.kind === "morning" ? "morning plan" : "evening results";
      const message = `PEP Landbank ${run.local_date} ${kind} report: ${origin}/dashboard/pipeline/daily-reports/${run.id} Sign in as Management to view and download the PDF.`;
      try {
        const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ sender: "Palmstead", message, recipients: [phone] }),
          signal: AbortSignal.timeout(12_000),
        });
        outcome = providerOutcome(response.status, await response.json().catch(() => null), phone);
        if (qaPhone && qaPhone !== phone && outcome.status === "accepted") {
          fetch("https://sms.arkesel.com/api/v2/sms/send", {
            method: "POST",
            headers: { "api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ sender: "Palmstead", message, recipients: [qaPhone] }),
            signal: AbortSignal.timeout(12_000),
          }).catch(() => {});
        }
      } catch {
        outcome = { status: "needs_review", reference: null, error: "SMS outcome uncertain; check Arkesel history before retrying." };
      }
    }
    if (outcome.status === "queued" && row.attempt_count >= 5)
      outcome = { status: "failed", reference: null, error: "Arkesel rate limit persisted after five attempts." };
    const now = new Date().toISOString();
    const { error: saveError } = await supabase.from("sales_daily_digest_deliveries").update({
      status: outcome.status,
      provider_reference: outcome.reference,
      provider_accepted_at: outcome.status === "accepted" ? now : null,
      last_error: outcome.error,
      lease_until: null,
      next_attempt_at: new Date(Date.now() + Math.min(2 ** row.attempt_count * 60_000, 21_600_000)).toISOString(),
      updated_at: now,
    }).eq("id", row.id).eq("status", "sending").eq("attempt_count", row.attempt_count);
    if (saveError) persistenceErrors++;
    else if (outcome.status === "accepted") accepted++;
    else if (outcome.status === "blocked") blocked++;
    else if (outcome.status === "failed") failed++;
    else if (outcome.status === "needs_review") needsReview++;
  }
  return Response.json({ accepted, blocked, failed, needsReview, persistenceErrors });
});
