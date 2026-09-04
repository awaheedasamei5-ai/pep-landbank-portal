import { useMutation } from '@tanstack/react-query';
import { getSupabaseClient } from '../data/client';
import { mapProfileRow } from '../data/mappers';
import { pinUnlockSession, removePinLock } from '../shared/lib/pinLock';
import { useSessionStore } from './useSessionStore';

// PIN counterpart to useLiveLogin.ts -- ported from index.html's doLogin()
// LOGIN_MODE==='pin' branch (7157-7168). Decrypts a previously-saved
// session (shared/lib/pinLock.ts) and restores it via setSession() rather
// than re-authenticating with Supabase; a wrong PIN or an expired/rotated
// refresh token both surface as a real, distinct error rather than a
// generic failure, and an expired-session failure also clears the stale
// lock so the picker doesn't keep offering a PIN that can't work anymore.
export function usePinLogin() {
  const loginLive = useSessionStore((s) => s.loginLive);

  return useMutation({
    mutationFn: async ({ agentKey, pin }: { agentKey: string; pin: string }) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Live mode is not configured on this build.');

      const session = await pinUnlockSession(agentKey, pin);
      if (!session) throw new Error('Incorrect PIN.');

      const { data, error } = await client.auth.setSession(session);
      if (error || !data.session) {
        removePinLock(agentKey);
        throw new Error('PIN sign-in expired on this device -- use your password once to reconnect it.');
      }

      const { data: row, error: profileErr } = await client.from('profiles').select('*').eq('id', data.session.user.id).maybeSingle();
      if (profileErr || !row) {
        await client.auth.signOut();
        removePinLock(agentKey);
        throw new Error('Could not sign in with PIN -- use your password.');
      }
      if (row.active === false) {
        await client.auth.signOut();
        removePinLock(agentKey);
        throw new Error('This account has been deactivated. Contact management.');
      }

      const profile = mapProfileRow(row);
      loginLive(profile);
      return profile;
    },
  });
}
