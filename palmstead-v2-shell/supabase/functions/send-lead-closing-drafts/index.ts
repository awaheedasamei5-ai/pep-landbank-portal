import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

// Outgoing SMS app, closing/nurture campaign (docs/plans/43 follow-up
// request, 2026-11-06). Runs monthly via dispatch_lead_closing_drafts()
// (pg_cron -> net.http_post, same pattern as every other finance worker
// in this project). For each real lead who has made no commitment yet
// (compute_lead_closing_candidates()), drafts one AI message via the
// shared ai-insights function, in a rotating "angle" so consecutive
// months to the same lead read genuinely differently, and inserts it as
// a PENDING row in outbound_sms_drafts -- it never sends on its own.
// Management reviews, edits if needed, and approves each one in the new
// Outgoing SMS app before anything reaches a real client.

const ANGLES = [
  "reassurance",
  "addressing_objections",
  "flexible_plans",
  "personal_checkin",
  "gentle_urgency",
  "social_proof",
  "plot_benefits",
] as const;

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

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const token = request.headers.get("x-internal-secret");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !serviceKey)
    return Response.json({ error: "Worker authorization is unavailable" }, { status: 401 });

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  // Reuses the same worker-token RPC/secret the finance monthly reminder
  // worker already uses -- this is still finance/CRM automation, same
  // trust domain, no reason to mint a second token.
  const { data: validToken, error: tokenError } = await supabase.rpc("verify_finance_monthly_reminder_worker_token", {
    p_token: token,
  });
  if (tokenError || validToken !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const companyPhoneRow = await supabase.from("app_config").select("company_phone").limit(1).maybeSingle();
  const companyPhone = companyPhoneRow.data?.company_phone ?? "";

  const { data: candidates, error: candidatesError } = await supabase.rpc("compute_lead_closing_candidates");
  if (candidatesError) return Response.json({ error: "Could not compute eligible leads" }, { status: 500 });

  let drafted = 0;
  let skipped = 0;
  let aiFailed = 0;
  for (const row of (candidates ?? []) as Candidate[]) {
    const phone = normalizeGhanaPhone(row.contact);
    if (!phone) {
      skipped += 1;
      continue;
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
      continue;
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
      continue;
    }
    drafted += 1;
  }

  return Response.json({ candidates: (candidates ?? []).length, drafted, skipped, aiFailed });
});
