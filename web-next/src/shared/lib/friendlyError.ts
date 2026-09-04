// Master Rebuild Specification Section 3.4 ("Error contract"): "No raw
// Postgres/Supabase error may be shown to staff. Translate known errors
// into plain English." -- ported from index.html's own friendlyErr() (added
// 2026-09-03 after a raw RLS-violation string was reported live in
// production), adapted for Supabase-js's real PostgrestError shape here
// (.code/.message, not just a bare string) rather than reinvented. The
// spec's own worked examples are the shapes matched below: a permission
// denial, a stale-data conflict, a validation failure, a lost connection.
//
// Every catch block across this app that does
// `e instanceof Error ? e.message : 'fallback'` is exactly the exposure
// this function replaces -- it takes the same `e`, returns a message safe
// to show a user, and never surfaces raw driver/server text for a
// recognized shape.
// For a call site that already throws/returns a hand-written, specific,
// safe-to-show message (e.g. "This file was exported from an older/newer
// version of the workbook... please re-export a fresh copy.") -- marks it
// so friendlyError() below returns that exact text unchanged instead of
// failing to recognize it as a known raw-error shape and replacing it with
// the generic fallback. Same problem legacy's throwFriendly() (index.html)
// solves for the identical reason -- caught live there first: a
// deliberately-written message getting silently mangled by an outer
// friendlyError() call is a real regression, not a hypothetical one.
export function friendlyErrorObj(message: string): Error {
  return Object.assign(new Error(message), { friendly: true });
}

export function friendlyError(e: unknown, fallback?: string): string {
  const err = e as { message?: unknown; code?: unknown; friendly?: unknown } | null | undefined;
  if (err?.friendly) return String(err.message);
  const raw = String(err?.message ?? e ?? '');
  const code = err?.code;

  if (/row-level security policy/i.test(raw)) return "You don't have permission to do that.";
  if (code === '23505' || /duplicate key value/i.test(raw)) return 'That record already exists.';
  if (code === '23503' || /violates foreign key constraint/i.test(raw)) return "That's linked to other records and can't be changed right now.";
  if (code === '23502' || /null value in column/i.test(raw)) return 'Please fill in all required fields.';
  if (code === 'PGRST301' || /JWT expired/i.test(raw)) return 'Your session expired — please sign in again.';
  if (/Failed to fetch|NetworkError|ERR_INTERNET|net::/i.test(raw)) return 'Your internet connection was lost. Your information has not been submitted yet. Try again.';
  if (/timeout|timed out/i.test(raw)) return 'That took too long — please try again.';

  return fallback || 'Something went wrong. Please try again.';
}
