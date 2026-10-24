import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  if (!authorization || !supabaseUrl || !anonKey) {
    return Response.json({ error: "Sign in before enabling device reminders." }, { status: 401, headers: CORS_HEADERS });
  }
  if (!publicKey) return Response.json({ error: "Device reminders are not configured yet." }, { status: 503, headers: CORS_HEADERS });

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return Response.json({ error: "Your sign-in expired. Sign in again to enable reminders." }, { status: 401, headers: CORS_HEADERS });
  }
  return Response.json({ publicKey }, { headers: { ...CORS_HEADERS, "Cache-Control": "private, no-store" } });
});
