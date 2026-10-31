import { getSupabaseClient } from './client';
import { friendlyFunctionsInvokeError } from '../shared/lib/friendlyError';

// docs/plans/42-urgent-bug-fixes-oct31.md -- same real reasoning as
// contractShareClient.ts/receiptClient.ts/sveReportClient.ts: whoever opens
// a quotation link (the prospect, or a staff member forwarding it) has no
// session/profile in play at that moment. Goes through the get-quotation
// edge function (service role, validates the token, returns a short-lived
// signed Storage URL) rather than a direct table query --
// quotation_share_links' RLS is closed to anon.
export interface QuotationLinkResult {
  url: string | null;
  notFound: boolean;
}

export async function resolveQuotationLink(token: string): Promise<QuotationLinkResult> {
  const client = getSupabaseClient();
  if (!client) return { url: null, notFound: false };
  const { data, error } = await client.functions.invoke('get-quotation', { body: { token } });
  if (error) throw new Error(await friendlyFunctionsInvokeError(error, 'This quotation link could not be opened right now. Please try again shortly.'));
  if (data?.error === 'not_found') return { url: null, notFound: true };
  if (data?.error) throw new Error(data.error);
  return { url: data?.url ?? null, notFound: false };
}
