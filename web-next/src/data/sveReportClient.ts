import { getSupabaseClient } from './client';

// Deliberately separate from data/source.ts's DataSource seam, same
// reasoning as receiptClient.ts/sveClient.ts -- a manager opening a
// report link from an SMS has no session/profile in play at that moment
// (they may not even be signed in yet), so there's no demoMode to key
// off of. Goes through the get-sve-report edge function (service role,
// validates the token, returns a short-lived signed Storage URL) rather
// than a direct table query -- sve_report_links' RLS is closed to anon.
export interface SveReportLinkResult {
  url: string | null;
  notFound: boolean;
}

export async function resolveSveReportLink(token: string): Promise<SveReportLinkResult> {
  const client = getSupabaseClient();
  if (!client) return { url: null, notFound: false };
  const { data, error } = await client.functions.invoke('get-sve-report', { body: { token } });
  if (error) throw error;
  if (data?.error === 'not_found') return { url: null, notFound: true };
  if (data?.error) throw new Error(data.error);
  return { url: data?.url ?? null, notFound: false };
}
