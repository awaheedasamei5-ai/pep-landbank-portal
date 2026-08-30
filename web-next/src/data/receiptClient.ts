import { getSupabaseClient } from './client';

// Deliberately separate from data/source.ts's DataSource seam, same
// reasoning as sveClient.ts -- a public visitor opening a receipt link has
// no session/profile, so there's no demoMode to key off of. Goes through
// the get-receipt edge function (service role, validates the token,
// returns a short-lived signed Storage URL) rather than a direct table
// query -- receipt_share_links' RLS is closed to anon on purpose.
export interface ReceiptLinkResult {
  url: string | null;
  notFound: boolean;
}

export async function resolveReceiptLink(token: string): Promise<ReceiptLinkResult> {
  const client = getSupabaseClient();
  if (!client) return { url: null, notFound: false };
  const { data, error } = await client.functions.invoke('get-receipt', { body: { token } });
  if (error) throw error;
  if (data?.error === 'not_found') return { url: null, notFound: true };
  if (data?.error) throw new Error(data.error);
  return { url: data?.url ?? null, notFound: false };
}
