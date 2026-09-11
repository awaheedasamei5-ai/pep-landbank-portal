"use client";

import { useAuthStore } from "@/stores/auth/auth-store";

// Mechanical adapter, not a rewrite -- the real copied web-next hooks/
// screens (src/webnext/) all read session state via
// `useSessionStore((s) => s.profile)` etc. This re-exports the SAME name
// backed by this shell's own real auth (src/stores/auth/auth-store.ts,
// already wired to real Supabase signInWithPassword -- see
// use-live-login.ts), instead of a second parallel session store. Every
// copied file keeps importing '../../../auth/useSessionStore' unedited.
// demoMode is always false -- this shell never runs demo mode.
export function useSessionStore<T>(selector: (s: { demoMode: boolean; profile: ReturnType<typeof useAuthStore.getState>["profile"]; logout: () => Promise<void> }) => T): T {
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  return selector({ demoMode: false, profile, logout });
}
