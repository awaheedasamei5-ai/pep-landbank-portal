import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isConfigured } from '../shared/lib/env';

// Points at whichever project VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY name
// -- during this build phase that is deliberately the STAGING project
// ("PALMSTEAD", an empty schema-clone), never production. Pointing this at
// the real production project ("PEP LANDBANK LTD") is a distinct, later,
// reviewed decision at cutover time -- see the V2 Blueprint's Deployment
// section. The anon key is safe to ship client-side by design; Postgres
// Row Level Security is the actual access boundary, verified per-table in
// the Blueprint's Security Architecture section.
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isConfigured('supabaseUrl') || !isConfigured('supabaseAnonKey')) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return client;
}
