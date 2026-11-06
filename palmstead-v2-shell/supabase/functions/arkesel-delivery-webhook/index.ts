import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

// Real Arkesel delivery-report receiver.
//
// Honest gap, stated plainly rather than fabricated: Arkesel's official V2
// docs did not expose a confirmed webhook payload/signature spec via public
// search during this build. Two independent third-party integrations
// (a Python SDK's `webhookSms(sender, message, recipients, callback_url)`
// call shape, and a community PHP/Node package's README) both describe the
// callback as an UNSIGNED request carrying `sms_id` and `status` -- as GET
// query parameters per the community package's own description. No signing
// scheme is confirmed to exist. This receiver therefore does NOT verify a
// signature (there is nothing documented to verify), and accepts both GET
// query params and a JSON POST body defensively, trying several plausible
// field name variants, so it degrades gracefully if the real shape differs
// slightly from what research could confirm. If deliveries never arrive
// here in practice, the next step is confirming the real payload shape
// directly with Arkesel support -- not guessing further.
Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let fields: Record<string, unknown> = {};
  const url = new URL(req.url);
  for (const [key, value] of url.searchParams.entries()) fields[key] = value;

  if (req.method === "POST") {
    try {
      const body: unknown = await req.json();
      if (body && typeof body === "object") fields = { ...fields, ...(body as Record<string, unknown>) };
    } catch {
      // Not JSON -- query params (if any) are all we have, which is fine.
    }
  }

  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = fields[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return String(value);
    }
    return null;
  };

  const smsId = pick("sms_id", "id", "message_id", "msgid");
  const status = pick("status", "delivery_status", "dlr_status");
  const recipient = pick("recipient", "destination", "msisdn", "phone");

  await supabase.from("sms_delivery_events").insert({
    provider_reference: smsId,
    sms_id_raw: smsId,
    recipient_phone: recipient,
    status,
    provider_status_raw: fields,
    event_time: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
