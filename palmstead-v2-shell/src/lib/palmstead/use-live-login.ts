"use client";

import { useState } from "react";

import type { Profile } from "@/lib/palmstead/types";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

// Direct port of web-next's src/auth/useLiveLogin.ts -- the real sign-in
// flow (index.html's original doLogin(), email/password branch): real
// Supabase Auth signInWithPassword, then a real `profiles` row lookup by
// auth.users.id, then the real `active` gate. A DB trigger
// (handle_new_auth_user) already guarantees a profiles row exists for
// any real auth user, so no client-side fallback provisioning is needed
// here either -- same as the original.
function mapProfileRow(r: Record<string, unknown>): Profile {
  return {
    key: r.agent_key as string,
    name: r.name as string,
    role: (r.role as Profile["role"] | null | undefined) ?? "agent",
    email: (r.email as string | null | undefined) ?? undefined,
    active: (r.active as boolean | null | undefined) ?? true,
    signatureData: (r.signature_data as string | null | undefined) ?? null,
    phone: (r.phone as string | null | undefined) ?? undefined,
  };
}

export function useLiveLogin() {
  const loginLive = useAuthStore((s) => s.loginLive);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(email: string, password: string): Promise<Profile | null> {
    setIsPending(true);
    setError(null);
    try {
      const client = requireSupabase();
      const { data, error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError || !data.user) {
        throw new Error(signInError?.message || "Wrong email or password.");
      }

      const { data: row, error: profileErr } = await client
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profileErr || !row) {
        await client.auth.signOut();
        throw new Error("Signed in, but no staff profile is set up for this account yet.");
      }
      if (row.active === false) {
        await client.auth.signOut();
        throw new Error("This account has been deactivated. Contact management.");
      }

      const profile = mapProfileRow(row);
      loginLive(profile);
      return profile;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong signing in.");
      return null;
    } finally {
      setIsPending(false);
    }
  }

  return { login, isPending, error };
}
