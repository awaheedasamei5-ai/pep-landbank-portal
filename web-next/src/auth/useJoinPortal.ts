import { useMutation } from '@tanstack/react-query';
import { getSupabaseClient } from '../data/client';
import { mapProfileRow } from '../data/mappers';
import { useSessionStore } from './useSessionStore';

// Port of index.html's self-service "join the portal" flow (openJoinCard/
// joinSubmit, index.html:8001-8038) -- a brand new employee signs
// themselves up with name/email/password, reached from the login
// screen's staff picker ("+ New employee"), not something Management
// does on their behalf. Real Supabase Auth signUp(); the resulting
// profile is created server-side by handle_new_auth_user(), which as of
// 2026-09-04 only succeeds if this email is on the real allowed_emails
// invite list (see StaffInvite's comment in types/domain.ts) -- an
// uninvited email fails here with a clear, real error rather than
// silently getting an account.
export function useJoinPortal() {
  const loginLive = useSessionStore((s) => s.loginLive);

  return useMutation({
    mutationFn: async ({ name, email, password }: { name: string; email: string; password: string }) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Live mode is not configured on this build.');

      const { data, error } = await client.auth.signUp({ email, password, options: { data: { name } } });
      if (error) {
        // The real "not invited" rejection is a Postgres exception raised
        // inside handle_new_auth_user() -- Supabase Auth wraps trigger
        // failures in a generic "Database error saving new user" message
        // rather than passing the raw exception text through, so this
        // maps that one known case to the real, specific explanation
        // rather than showing someone a raw plumbing error.
        if (/database error saving new user/i.test(error.message)) {
          throw new Error("This email hasn't been invited yet. Ask your manager to add you first.");
        }
        throw new Error(error.message || 'Could not create account.');
      }
      if (!data.session) {
        // Email confirmation is required on this project -- a real,
        // different outcome from "signed in," not an error.
        return { pendingConfirmation: true as const };
      }

      const { data: row, error: profileErr } = await client.from('profiles').select('*').eq('id', data.user!.id).maybeSingle();
      if (profileErr || !row) {
        throw new Error('Account created, but no staff profile was set up. Contact management.');
      }
      const profile = mapProfileRow(row);
      loginLive(profile);
      return { pendingConfirmation: false as const, profile };
    },
  });
}
