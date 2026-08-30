import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Public, token-based receipt download -- mirrors this app's one other
// anon-access flow (Site Visit Experience's get_site_visit_invite RPC)
// exactly, but through an edge function instead of a Postgres RPC because
// the payload here is a signed Storage URL, and Storage RLS is enforced by
// the Storage API itself, not reachable from inside a SECURITY DEFINER
// SQL function. receipt_share_links' own table RLS is closed to anon (see
// its migration) -- this function is the only path in, using the service
// role (built into every Supabase edge function's env, never shipped to
// the client) to look up the token and mint a short-lived signed URL for
// the stored PDF. Both audiences the user asked for -- the client, and
// the staff member in charge -- use the exact same link; there's no
// separate identity check per audience, matching the same trust model
// SVE's invite links already use (whoever has the link can open it).

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const token = req.method === "POST" ? ((await req.json().catch(() => ({})))?.token as string | undefined) : url.searchParams.get("token") ?? undefined;

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Receipt sharing is not configured on the server yet" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: link, error: linkError } = await admin.from("receipt_share_links").select("storage_path, payment_id").eq("token", token).maybeSingle();
  if (linkError) {
    return new Response(JSON.stringify({ error: "Lookup failed", detail: linkError.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  if (!link) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { data: signed, error: signError } = await admin.storage.from("payment-receipts").createSignedUrl(link.storage_path, 300);
  if (signError || !signed) {
    return new Response(JSON.stringify({ error: "Could not prepare the receipt file", detail: signError?.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ url: signed.signedUrl }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
