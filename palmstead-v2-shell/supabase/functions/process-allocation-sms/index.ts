import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type OutboxRow = {
  id: string;
  allocation_request_id: string;
  lead_id: string;
  recipient_key: string;
  attempt_count: number;
};

type AllocationRequest = {
  lead_id: string | null;
  agent_key: string;
  client_name: string;
  percent_paid: number | null;
  status: string;
};

type Lead = {
  name: string;
  agent_key: string;
  grand_total: number;
  amt_paid: number;
  deleted_at: string | null;
};

type Agent = { name: string; phone: string | null; active: boolean };
type Config = { allocation_threshold_pct: number | null };
type Delivery = {
  status: "sent" | "failed" | "pending" | "needs_review";
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

function classifyProvider(httpStatus: number, body: unknown, recipient: string): Delivery {
  const response = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawData = response.data;
  const rows = Array.isArray(rawData) ? rawData : [rawData];
  let item: Record<string, unknown> | undefined;
  if (Array.isArray(rawData)) {
    item = rows.find((row) =>
      row &&
      typeof row === "object" &&
      String((row as Record<string, unknown>).recipient ?? "").replace(/\D/g, "") === recipient
    ) as Record<string, unknown> | undefined;
  } else if (rawData && typeof rawData === "object") {
    item = rawData as Record<string, unknown>;
  }
  const rawReference = item?.id ?? item?.message_id;
  const reference = typeof rawReference === "string" && rawReference.trim() ? rawReference.trim() : null;
  const providerStatus = { httpStatus, status: response.status ?? null };
  if (httpStatus >= 200 && httpStatus < 300 && response.status === "success" && reference) {
    return { status: "sent", providerReference: reference, error: null, providerStatus };
  }
  if (httpStatus === 429 && response.status !== "success" && !reference) {
    return { status: "pending", providerReference: null, error: "SMS provider rate limit reached; retry queued.", providerStatus };
  }
  if ([400, 401, 402, 403, 404, 413, 422].includes(httpStatus) && !reference) {
    return { status: "failed", providerReference: null, error: `SMS provider rejected the request (HTTP ${httpStatus}).`, providerStatus };
  }
  return { status: "needs_review", providerReference: reference, error: "SMS outcome is ambiguous; check provider history before retrying.", providerStatus };
}

async function persist(
  supabase: ReturnType<typeof createClient>,
  row: OutboxRow,
  delivery: Delivery,
) {
  const retryDelayMinutes = Math.min(60, Math.max(5, row.attempt_count * 5));
  const nextAttempt = delivery.status === "pending" && row.attempt_count < 5
    ? new Date(Date.now() + retryDelayMinutes * 60_000).toISOString()
    : null;
  const status = delivery.status === "pending" && !nextAttempt ? "failed" : delivery.status;
  const { error } = await supabase
    .from("allocation_sms_outbox")
    .update({
      status,
      claimed_at: null,
      next_attempt_at: nextAttempt ?? new Date().toISOString(),
      provider_reference: delivery.providerReference,
      provider_status: delivery.providerStatus,
      last_error: delivery.error,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  return error;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const token = request.headers.get("x-internal-secret");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !serviceKey)
    return Response.json({ error: "Worker authorization is unavailable" }, { status: 401 });

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: validToken, error: tokenError } = await supabase.rpc("verify_allocation_sms_worker_token", { p_token: token });
  if (tokenError || validToken !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = Deno.env.get("ARKESEL_API_KEY");
  const { data: rows, error: claimError } = await supabase.rpc("claim_allocation_sms_outbox", { p_limit: 10 });
  if (claimError) return Response.json({ error: "Could not claim allocation messages" }, { status: 500 });

  let sent = 0;
  let failed = 0;
  let pending = 0;
  let needsReview = 0;
  let blocked = 0;
  let persistenceErrors = 0;

  for (const row of (rows ?? []) as OutboxRow[]) {
    const [allocationResult, leadResult, agentResult, configResult] = await Promise.all([
      supabase
        .from("allocation_requests")
        .select("lead_id,agent_key,client_name,percent_paid,status")
        .eq("id", row.allocation_request_id)
        .maybeSingle(),
      supabase
        .from("leads")
        .select("name,agent_key,grand_total,amt_paid,deleted_at")
        .eq("id", row.lead_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("name,phone,active")
        .eq("agent_key", row.recipient_key)
        .eq("active", true)
        .maybeSingle(),
      supabase
        .from("app_config")
        .select("allocation_threshold_pct")
        .limit(1)
        .maybeSingle(),
    ]);

    if (allocationResult.error || leadResult.error || agentResult.error || configResult.error) {
      const error = await persist(supabase, row, {
        status: "pending",
        providerReference: null,
        error: "Allocation or staff records could not be rechecked; retry queued.",
        providerStatus: null,
      });
      if (error) persistenceErrors += 1;
      else pending += 1;
      continue;
    }

    const allocation = allocationResult.data as AllocationRequest | null;
    const lead = leadResult.data as Lead | null;
    const agent = agentResult.data as Agent | null;
    const config = configResult.data as Config | null;
    const threshold = Number(config?.allocation_threshold_pct ?? 30);

    if (
      !allocation || allocation.status !== "Pending" || allocation.agent_key !== row.recipient_key ||
      !lead || lead.deleted_at || lead.agent_key !== row.recipient_key ||
      !(Number(lead.grand_total) > 0) ||
      Number(lead.amt_paid) / Number(lead.grand_total) * 100 < threshold
    ) {
      const error = await persist(supabase, row, {
        status: "failed",
        providerReference: null,
        error: "The allocation request or payment threshold changed before SMS delivery.",
        providerStatus: null,
      });
      if (error) persistenceErrors += 1;
      else failed += 1;
      continue;
    }

    const phone = normalizeGhanaPhone(agent?.phone);
    if (!agent || !phone) {
      const error = await persist(supabase, row, {
        status: "blocked",
        providerReference: null,
        error: "The assigned active salesperson has no valid phone number in their staff profile.",
        providerStatus: null,
      });
      if (error) persistenceErrors += 1;
      else blocked += 1;
      continue;
    }
    if (!apiKey) {
      const error = await persist(supabase, row, {
        status: "blocked",
        providerReference: null,
        error: "The Arkesel SMS key is not configured on the server.",
        providerStatus: null,
      });
      if (error) persistenceErrors += 1;
      else blocked += 1;
      continue;
    }

    const staffName = (agent.name || "there").replace(/[\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
    const clientName = (lead.name || allocation.client_name || "your client").replace(/[\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    const percent = Math.round((Number(lead.amt_paid) / Number(lead.grand_total)) * 100);
    const message = `Hello ${staffName}, ${clientName} has paid ${percent}% of the purchase price and is due for plot allocation. Review the request in Palmstead Allocations: https://palmstead-v2-shell.vercel.app/dashboard/allocations - PEP Landbank`;

    let delivery: Delivery;
    try {
      const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ sender: "Palmstead", message, recipients: [phone] }),
        signal: AbortSignal.timeout(12_000),
      });
      const body: unknown = await response.json().catch(() => null);
      delivery = classifyProvider(response.status, body, phone);
    } catch {
      delivery = {
        status: "needs_review",
        providerReference: null,
        error: "SMS outcome is uncertain; check provider history before retrying.",
        providerStatus: null,
      };
    }

    const error = await persist(supabase, row, delivery);
    if (error) persistenceErrors += 1;
    else if (delivery.status === "sent") sent += 1;
    else if (delivery.status === "pending") pending += 1;
    else if (delivery.status === "needs_review") needsReview += 1;
    else failed += 1;
  }

  return Response.json({ claimed: (rows ?? []).length, sent, pending, failed, blocked, needsReview, persistenceErrors });
});
