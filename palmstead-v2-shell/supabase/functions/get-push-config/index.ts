import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { Buffer } from "node:buffer";
import { createECDH } from "node:crypto";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function publicKeyFromPrivate(privateKey: string): string {
  const secret = Buffer.from(privateKey, "base64url");
  if (secret.length !== 32) throw new Error("Invalid VAPID private key length");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(secret);
  const publicPoint = ecdh.getPublicKey(undefined, "uncompressed");
  if (publicPoint.length !== 65 || publicPoint[0] !== 4) throw new Error("Invalid VAPID public point");
  return publicPoint.toString("base64url");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !supabaseUrl || !anonKey) {
    return Response.json({ error: "Sign in before enabling device reminders." }, { status: 401, headers: CORS_HEADERS });
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return Response.json({ error: "Your sign-in expired. Sign in again to enable reminders." }, { status: 401, headers: CORS_HEADERS });
  }
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!privateKey) return Response.json({ error: "Device reminders are not configured yet." }, { status: 503, headers: CORS_HEADERS });
  let publicKey: string;
  try {
    publicKey = publicKeyFromPrivate(privateKey);
  } catch {
    return Response.json({ error: "Device reminder keys need repair." }, { status: 503, headers: CORS_HEADERS });
  }
  return Response.json({ publicKey }, { headers: { ...CORS_HEADERS, "Cache-Control": "private, no-store" } });
});

