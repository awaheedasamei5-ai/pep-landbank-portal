import { useMutation } from '@tanstack/react-query';
import { getSupabaseClient } from '../data/client';

// Port of index.html's in-app password reset (index.html:7083-7112) --
// email -> 6-digit code -> new password, no redirect link (the code
// arrives by email via Supabase Auth's own resetPasswordForEmail/
// verifyOtp with type:'recovery', not a magic-link flow). Two separate
// mutations matching the two real steps, so the UI can show a real
// per-step pending/error state rather than one combined form.
export function useSendResetCode() {
  return useMutation({
    mutationFn: async (email: string) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Live mode is not configured on this build.');
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error) throw new Error(error.message || 'Could not send code.');
    },
  });
}

export function useConfirmReset() {
  return useMutation({
    mutationFn: async ({ email, code, password }: { email: string; code: string; password: string }) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Live mode is not configured on this build.');
      const { error: verifyErr } = await client.auth.verifyOtp({ email, token: code, type: 'recovery' });
      if (verifyErr) throw new Error(verifyErr.message || 'That code is invalid or expired.');
      const { error: updErr } = await client.auth.updateUser({ password });
      if (updErr) throw new Error(updErr.message || 'Could not set new password.');
      // Signed out deliberately -- verifyOtp leaves a real session behind
      // (that's how updateUser is allowed to run at all), but the real
      // intent here is "reset my password," not "log me in as a side
      // effect." Matches index.html exactly: sign out, go back to the
      // normal sign-in form, use the new password there.
      await client.auth.signOut();
    },
  });
}
