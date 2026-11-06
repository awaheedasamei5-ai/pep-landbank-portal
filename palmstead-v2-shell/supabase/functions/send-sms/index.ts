import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeGhNumber(n: string): string {
  const raw = String(n).replace(/[^\d+]/g, "");
  if (raw.startsWith("+")) return raw.slice(1);
  if (/^0\d{9}$/.test(raw)) return "233" + raw.slice(1);
  return raw;
}

// Real Arkesel segment-counting rules (SMS Length and Unicode,
// arkesel.com/sms-length-and-unicode): GSM-7 160/153, Unicode (UCS-2) 70/67.
// Kept inline (not a shared cross-function import) to match this codebase's
// own established per-function convention and avoid bundler path issues.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

function computeSmsSegments(message: string): { encoding: "gsm7" | "unicode"; messageLength: number; segmentCount: number } {
  let effectiveLength = 0;
  let isGsm7 = true;
  for (const ch of message) {
    if (GSM_BASIC.includes(ch)) effectiveLength += 1;
    else if (GSM_EXTENDED.includes(ch)) effectiveLength += 2;
    else {
      isGsm7 = false;
      break;
    }
  }
  const encoding: "gsm7" | "unicode" = isGsm7 ? "gsm7" : "unicode";
  const messageLength = Array.from(message).length;
  if (!isGsm7) effectiveLength = messageLength;
  const singleLimit = encoding === "gsm7" ? 160 : 70;
  const multiLimit = encoding === "gsm7" ? 153 : 67;
  const segmentCount = effectiveLength <= singleLimit ? 1 : Math.ceil(effectiveLength / multiLimit);
  return { encoding, messageLength, segmentCount };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  try {
    const { to, message, sender, kind } = await req.json();
    if (!to || !message) {
      return new Response(JSON.stringify({ error: "Missing 'to' or 'message'" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("ARKESEL_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "SMS is not configured on the server yet" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const recipients = (Array.isArray(to) ? to : [to]).map(normalizeGhNumber);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    // Real finding (Phase C, docs/plans/48): Arkesel's official webhook
    // payload/signature contract could not be confirmed via public docs;
    // two independent third-party integrations describe an unsigned
    // callback carrying sms_id/status. callback_url is included on every
    // send on a best-effort basis so delivery events start flowing once the
    // real field name is confirmed with Arkesel support, if it differs.
    const callbackUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/arkesel-delivery-webhook` : undefined;
    const resp = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: sender || "Palmstead",
        message,
        recipients,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      }),
    });
    const data = await resp.json().catch(() => ({}));

    let providerReference: string | null = null;
    const rawData = (data as Record<string, unknown>)?.data;
    const item = Array.isArray(rawData) ? rawData[0] : rawData;
    if (item && typeof item === "object") {
      const value = (item as Record<string, unknown>).id ?? (item as Record<string, unknown>).message_id;
      if (typeof value === "string" && value.trim()) providerReference = value.trim();
    }

    try {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey);
        const { encoding, messageLength, segmentCount } = computeSmsSegments(String(message));
        await supabase.from("sms_send_log").insert({
          kind: typeof kind === "string" && kind.trim() ? kind.trim() : "unspecified",
          recipient_phone: recipients[0] ?? "",
          provider_reference: providerReference,
          message_length: messageLength,
          encoding,
          segment_count: segmentCount,
        });
      }
    } catch {
      // Never let logging failure break a real SMS send.
    }

    return new Response(JSON.stringify({ ok: resp.ok, status: resp.status, data, providerReference }), {
      status: resp.ok ? 200 : 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
