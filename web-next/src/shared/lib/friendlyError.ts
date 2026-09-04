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

// Real RPCs across this codebase (grep `raise exception` across
// supabase_migrations) raise two different shapes: a full human sentence
// ('Only Management can approve or decline a payment' -- already safe to
// show verbatim) or a short machine-style code with no spaces
// ('not_authorized', 'amt_paid_locked', 'invalid_stage') meant to be looked
// up, not read. This map translates the known codes; anything sentence-
// shaped falls through to the pass-through check below instead of needing
// a duplicate entry here.
const KNOWN_CODES: Record<string, string> = {
  not_authenticated: 'Please sign in again to do that.',
  already_linked: 'This is already linked to an account.',
  not_linked: "This link hasn't been activated yet.",
  invalid_pin: 'PIN must be 4 to 6 digits.',
  amt_paid_locked: 'Only Elias or Management can record payments. Ask them to log this payment.',
  not_authorized: "You don't have permission to do that.",
  invalid_stage: "That stage isn't valid for this record.",
  stale_version: 'This record has already been updated by another user. Refresh and review the latest version before saving.',
};

// A raised Postgres exception whose text is a genuine hand-written sentence
// (starts with a capital letter, contains a space, no SQL/driver internals
// leaking through) is exactly the kind of message this whole function
// exists to preserve, not overwrite with a generic fallback -- confirmed
// live 2026-09-06: approve_payment's real 'Only Management can approve or
// decline a payment' and confirm_allocation's authorization messages were
// both being silently replaced by 'Something went wrong' because neither
// matched any of the raw-shape rules below.
function looksLikeSafeSentence(raw: string): boolean {
  if (raw.length < 4 || raw.length > 200) return false;
  if (!/^[A-Z]/.test(raw)) return false;
  if (!/\s/.test(raw)) return false;
  if (/relation |column |syntax error|permission denied for|SQLSTATE|violates|duplicate key|constraint "|::|ERROR:/i.test(raw)) return false;
  return true;
}

export function friendlyError(e: unknown, fallback?: string): string {
  const err = e as { message?: unknown; code?: unknown; friendly?: unknown } | null | undefined;
  if (err?.friendly) return String(err.message);
  const raw = String(err?.message ?? e ?? '').trim();
  const code = err?.code;

  if (/row-level security policy/i.test(raw)) return "You don't have permission to do that.";
  if (code === '23505' || /duplicate key value/i.test(raw)) return 'That record already exists.';
  if (code === '23503' || /violates foreign key constraint/i.test(raw)) return "That's linked to other records and can't be changed right now.";
  if (code === '23502' || /null value in column/i.test(raw)) return 'Please fill in all required fields.';
  if (code === '23514' || /violates check constraint/i.test(raw)) return "That value isn't valid for this field.";
  if (code === '22P02' || /invalid input syntax/i.test(raw)) return "One of the values entered isn't in the right format.";
  if (code === 'PGRST301' || /JWT expired/i.test(raw)) return 'Your session expired — please sign in again.';
  if (/Failed to fetch|NetworkError|ERR_INTERNET|net::/i.test(raw)) return 'Your internet connection was lost. Your information has not been submitted yet. Try again.';
  if (/timeout|timed out/i.test(raw)) return 'That took too long — please try again.';
  if (Object.prototype.hasOwnProperty.call(KNOWN_CODES, raw)) return KNOWN_CODES[raw];
  if (looksLikeSafeSentence(raw)) return raw;

  return fallback || 'Something went wrong. Please try again.';
}
