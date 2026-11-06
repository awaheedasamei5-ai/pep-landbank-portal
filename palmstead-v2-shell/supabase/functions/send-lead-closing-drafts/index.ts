import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const ANGLES = [
  "reassurance",
  "addressing_objections",
  "flexible_plans",
  "personal_checkin",
  "gentle_urgency",
  "social_proof",
  "plot_benefits",
] as const;

// Real limit per invocation -- docs/plans/47 open item 2: processing all
// real candidates sequentially (one Groq call per lead) hit the edge
// function execution-time limit. The cron now runs every 20 minutes
// (instead of monthly) so a backlog larger than this batch drains over a
// few ticks; compute_lead_closing_candidates() already excludes leads
// drafted in the last 30 real days, so frequent runs are self-limiting.
const BATCH_LIMIT = 25;
const CONCURRENCY = 5;

type Candidate = {
  lead_id: string;
  name: string;
  plot_type: string;
  contact: string | null;
  agent_key: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  prior_draft_count: number;
};

function normalizeGhanaPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return digits;
  return null;
}

function cleanText(value: string, maxLength: number): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

// Processes up to CONCURRENCY leads at a time instead of one at a time --
// the same total work finishes in a fraction of the wall-clock time, well
// inside the platform's per-invocation execution budget.
async function processInBatches<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(worker));
  }
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

  const companyPhoneRow = await supabase.from("app_config").select("company_phone").limit(1).maybeSingle();
  const companyPhone = companyPhoneRow.data?.company_phone ?? "";

  const { data: candidates, error: candidatesError } = await supabase.rpc("compute_lead_closing_candidates", {
    p_limit: BATCH_LIMIT,
  });
  if (candidatesError) return Response.json({ error: "Could not compute eligible leads" }, { status: 500 });

  let drafted = 0;
  let skipped = 0;
  let aiFailed = 0;

  await processInBatches((candidates ?? []) as Candidate[], CONCURRENCY, async (row) => {
    const phone = normalizeGhanaPhone(row.contact);
    if (!phone) {
      // Real data-quality gap, not transient -- record it so this lead
      // doesn't reoccupy a batch slot on every 20-minute tick forever.
      const angle = ANGLES[row.prior_draft_count % ANGLES.length];
      await supabase.rpc("insert_lead_closing_skip", { p_lead_id: row.lead_id, p_name: row.name, p_angle: angle });
      skipped += 1;
      return;
    }
    const hasAgent = !!row.agent_name && !!row.agent_phone;
    const angle = ANGLES[row.prior_draft_count % ANGLES.length];
    const aiResp = await fetch(`${url}/functions/v1/ai-insights`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "lead_closing_sms",
        context: {
          plotType: (row.plot_type || "plot").toLowerCase(),
          angle,
          hasAgent,
          agentName: hasAgent ? row.agent_name : undefined,
          agentPhone: hasAgent ? row.agent_phone : undefined,
          companyPhone,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    const aiBody: unknown = aiResp ? await aiResp.json().catch(() => null) : null;
    const draft = typeof (aiBody as { message?: unknown })?.message === "string" ? (aiBody as { message: string }).message.trim() : "";
    if (!draft) {
      aiFailed += 1;
      return;
    }
    const firstName = cleanText(row.name, 40).split(" ")[0] || "there";
    const body = cleanText(draft.replace(/\{ClientName\}/g, firstName), 480);
    const { error: insertError } = await supabase.rpc("insert_lead_closing_draft", {
      p_lead_id: row.lead_id,
      p_name: row.name,
      p_phone: phone,
      p_body: body,
      p_angle: angle,
    });
    if (insertError) {
      aiFailed += 1;
      return;
    }
    drafted += 1;
  });

  return Response.json({ candidates: (candidates ?? []).length, drafted, skipped, aiFailed });
});
