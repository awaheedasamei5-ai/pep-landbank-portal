import { useMutation } from '@tanstack/react-query';
import { getSupabaseClient } from '../data/client';
import { mapProfileRow } from '../data/mappers';
import { useSessionStore } from './useSessionStore';

// Real Supabase Auth sign-in (index.html's own doLogin(), email/password
// branch -- index.html:7178-7190). Two real pieces of that flow are
// deliberately NOT ported: the staff-picker-before-password UI (needs a
// publicly-readable roster pre-auth, which index.html gets from a bundled
// STAFF_LIST -- this cut just takes an email directly) and the PIN quick-
// unlock / password-reset-via-OTP paths (real, separable features, not
// needed for a first live-mode cut to exist at all).
//
// One piece of index.html's flow this DOESN'T need to replicate:
// provisionProfile()'s client-side fallback for "signed in but no
// profiles row yet." Verified live (pg_get_functiondef, both staging and
// production) that a real DB trigger (handle_new_auth_user, SECURITY
// DEFINER, fires on auth.users insert) already auto-creates a profiles
// row server-side for any brand-new Supabase Auth user -- so by the time
// this hook's second query runs, a row is guaranteed to exist.
export function useLiveLogin() {
  const loginLive = useSessionStore((s) => s.loginLive);

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Live mode is not configured on this build.');

      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        throw new Error(error?.message ? `Sign-in failed: ${error.message}` : 'Wrong email or password.');
      }

      const { data: row, error: profileErr } = await client.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
      if (profileErr || !row) {
        await client.auth.signOut();
        throw new Error('Signed in, but no staff profile is set up for this account yet.');
      }
      if (row.active === false) {
        await client.auth.signOut();
        throw new Error('This account has been deactivated. Contact management.');
      }

      const profile = mapProfileRow(row);
      loginLive(profile);
      return profile;
    },
  });
}
