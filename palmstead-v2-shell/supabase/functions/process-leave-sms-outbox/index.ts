import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { classifyProviderResponse, type DeliveryOutcome } from "./delivery.ts";

type OutboxRow = {
  id: string;
  recipient_phone: string | null;
  message_body: string;
  attempt_count: number;
};

function normalizeGhanaPhone(value: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return digits;
  return null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const workerToken = request.headers.get("x-internal-secret");
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!workerToken || !projectUrl || !serviceRoleKey) {
    return Response.json({ error: "Worker authorization is unavailable" }, { status: 401 });
  }

  const supabase = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: validToken, error: tokenError } = await supabase.rpc("verify_leave_sms_worker_token", {
    p_token: workerToken,
  });
  if (tokenError || validToken !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = Deno.env.get("ARKESEL_API_KEY");
  const { data, error } = await supabase.rpc("claim_leave_sms_outbox", { p_limit: 10 });
  if (error) return Response.json({ error: "Could not claim queued messages" }, { status: 500 });

  const rows = (data ?? []) as OutboxRow[];
  let accepted = 0;
  let failed = 0;
  let needsReview = 0;
  let retryQueued = 0;
  let persistenceErrors = 0;

  for (const row of rows) {
    const phone = normalizeGhanaPhone(row.recipient_phone);
    let outcome: DeliveryOutcome;
    let providerStatus: Record<string, unknown> | null = null;

    if (!apiKey) {
      outcome = { status: "failed", providerReference: null, error: "SMS provider is not configured on the server." };
    } else if (!phone) {
      outcome = { status: "failed", providerReference: null, error: "The staff phone number is not a valid Ghana mobile number." };
    } else {
      try {
        const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ sender: "Palmstead", message: row.message_body, recipients: [phone] }),
          signal: AbortSignal.timeout(12_000),
        });
        const body: unknown = await response.json().catch(() => null);
        providerStatus = { httpStatus: response.status };
        outcome = classifyProviderResponse(response.status, body, phone);
      } catch {
        outcome = {
          status: "needs_review", providerReference: null,
          error: "No conclusive SMS provider response was received. Check the provider history before retrying.",
        };
      }
    }

    if (outcome.status === "queued" && row.attempt_count >= 5) {
      outcome = { ...outcome, status: "failed", error: "SMS provider rate limit persisted after five attempts." };
    }
    const backoffSeconds = Math.min(2 ** row.attempt_count * 60, 21_600);
    const { error: updateError } = await supabase
      .from("leave_sms_outbox")
      .update({
        status: outcome.status,
        next_attempt_at: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
        provider_accepted_at: outcome.status === "accepted" ? new Date().toISOString() : null,
        lease_until: null,
        provider_reference: outcome.providerReference,
        last_error: outcome.error,
        provider_status: providerStatus,
      })
      .eq("id", row.id)
      .eq("status", "sending")
      .eq("attempt_count", row.attempt_count);
    if (updateError) persistenceErrors += 1;
    else if (outcome.status === "accepted") accepted += 1;
    else if (outcome.status === "needs_review") needsReview += 1;
    else if (outcome.status === "queued") retryQueued += 1;
    else failed += 1;
  }

  return Response.json(
    { claimed: rows.length, providerAccepted: accepted, failed, needsReview, retryQueued, persistenceErrors },
    { status: persistenceErrors ? 503 : 200 },
  );
});
