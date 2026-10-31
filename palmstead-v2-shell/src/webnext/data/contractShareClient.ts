import { getSupabaseClient } from './client';
import { friendlyFunctionsInvokeError } from '../shared/lib/friendlyError';

// Deliberately separate from data/source.ts's DataSource seam, same
// reasoning as receiptClient.ts/sveReportClient.ts -- whoever opens a
// contract link (the client, or a staff member forwarding it) has no
// session/profile in play at that moment. Goes through the get-contract
// edge function (service role, validates the token, returns a short-lived
// signed Storage URL) rather than a direct table query --
// contract_share_links' RLS is closed to anon.
export interface ContractLinkResult {
  url: string | null;
  notFound: boolean;
}

export async function resolveContractLink(token: string): Promise<ContractLinkResult> {
  const client = getSupabaseClient();
  if (!client) return { url: null, notFound: false };
  const { data, error } = await client.functions.invoke('get-contract', { body: { token } });
  if (error) throw new Error(await friendlyFunctionsInvokeError(error, 'This contract link could not be opened right now. Please try again shortly.'));
  if (data?.error === 'not_found') return { url: null, notFound: true };
  if (data?.error) throw new Error(data.error);
  return { url: data?.url ?? null, notFound: false };
}
