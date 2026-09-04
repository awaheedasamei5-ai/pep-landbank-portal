import { env, isConfigured } from '../shared/lib/env';

// Deliberately separate from data/source.ts's DataSource seam, same
// reasoning as sveClient.ts/receiptClient.ts -- a public visitor on this
// page has no session/profile, so there's no demoMode to key off of. Plain
// fetch (not supabase-js's functions.invoke) because public-stats is
// designed to be called from a page entirely outside this app too (the
// legacy external homepage widget) -- its CORS headers and query-string
// contract (?agent=<token>) are built around a bare GET, not the JS SDK.
// Real, live endpoint (public-stats, verify_jwt:false) -- confirmed
// already running on production since 2026-08-29 for the external
// homepage widget; ported to staging 2026-09-04 alongside a matching
// profiles.widget_token column so this same function serves both.
export interface PublicStats {
  ok: boolean;
  personalized: boolean;
  agentName?: string;
  streakLen?: number;
  siteVisitsThisWeek: number;
  pipelineValue?: number;
  clientsThisMonth?: number;
  totalClients?: number;
  plotsSoldThisMonth?: number;
  generatedAt: string;
}

export async function fetchPublicStats(agentToken?: string): Promise<PublicStats | null> {
  if (!isConfigured('supabaseUrl')) return null;
  const qs = agentToken ? `?agent=${encodeURIComponent(agentToken)}` : '';
  const res = await fetch(`${env.supabaseUrl}/functions/v1/public-stats${qs}`, {
    headers: isConfigured('supabaseAnonKey') ? { apikey: env.supabaseAnonKey } : undefined,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.ok ? data : null;
}
