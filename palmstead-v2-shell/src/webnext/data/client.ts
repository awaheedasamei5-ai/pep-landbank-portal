import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabase } from "@/lib/supabase.client";

// Mechanical adaptation of web-next's real src/data/client.ts -- same
// real Supabase project (sbydzrlzqxcdbudjaube), just reusing this
// shell's own already-configured client instead of a second parallel
// instantiation of the same connection.
export function getSupabaseClient(): SupabaseClient | null {
  return requireSupabase();
}
