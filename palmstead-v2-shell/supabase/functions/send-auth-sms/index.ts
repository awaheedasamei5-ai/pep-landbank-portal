import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

import { classifyProviderResponse } from "../process-leave-sms-outbox/delivery.ts";

type SmsEvent = { user?: { id?: string; phone?: string }; sms?: { otp?: string } };

function recipient(value: string | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (/^233\d{9}$/.test(digits)) return digits;
  return null;
}

function verifiedEvent(payload: string, headers: Headers, secrets: string): SmsEvent | null {
  for (const entry of secrets.split("|").map((value) => value.trim()).filter(Boolean)) {
    try {
      const secret = entry.replace(/^v1,whsec_/, "");
      return new Webhook(secret).verify(payload, Object.fromEntries(headers)) as SmsEvent;
    } catch {
      // A rotated secret may still be valid; try the next configured secret.
    }
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const hookSecrets = Deno.env.get("SEND_SMS_HOOK_SECRET");
  const apiKey = Deno.env.get("ARKESEL_API_KEY");
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!hookSecrets || !apiKey || !projectUrl || !serviceKey) {
    return new Response("SMS service unavailable", { status: 503 });
  }

  const raw = await request.text();
  const event = verifiedEvent(raw, request.headers, hookSecrets);
  if (!event) return new Response("Invalid hook signature", { status: 401 });

  const phone = recipient(event.user?.phone);
  const otp = event.sms?.otp;
  if (!event.user?.id || !phone || !otp || !/^\d{6,8}$/.test(otp)) {
    return new Response("Invalid authentication event", { status: 400 });
  }

  // A phone-only signup must not receive a code. Palmstead accounts are
  // invited first and have an active staff profile linked to this Auth ID.
  const supabase = createClient(projectUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: staff, error: staffError } = await supabase
    .from("profiles")
    .select("id,active")
    .eq("id", event.user.id)
    .maybeSingle();
  if (staffError || !staff || staff.active !== true) {
    return new Response("Staff account unavailable", { status: 403 });
  }

  try {
    const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: "Palmstead",
        message: `Your Palmstead sign-in code is ${otp}. It expires soon. Do not share this code.`,
        recipients: [phone],
      }),
      signal: AbortSignal.timeout(3_500),
    });
    const body: unknown = await response.json().catch(() => null);
    const outcome = classifyProviderResponse(response.status, body, phone);
    if (outcome.status !== "accepted") {
      return new Response("SMS delivery unavailable", { status: 503 });
    }
    return Response.json({});
  } catch {
    return new Response("SMS delivery unavailable", { status: 503 });
  }
});
