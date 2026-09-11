import { createClient } from "@supabase/supabase-js";

// Palmstead's real backend -- the same Supabase project the existing
// web-next build already runs against (sbydzrlzqxcdbudjaube), reused
// here rather than standing up a second database. Client-only: every
// real table already has RLS enforcing who can read/write what, so this
// anon-key client is safe to construct in the browser exactly the way
// web-next's own data/client.ts does it.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export function requireSupabase() {
  if (!supabase)
    throw new Error("Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  return supabase;
}
