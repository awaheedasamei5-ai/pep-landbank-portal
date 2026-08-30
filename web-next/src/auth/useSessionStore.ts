import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile, Role } from '../types/domain';
import { getSupabaseClient } from '../data/client';

// Replaces index.html's bare `sb`/`LIVE_MODE`/`DEMO_MODE`/`PROFILE` globals
// (index.html:2049) with one persisted store. Live mode (loginLive) was
// wired up once a safe way to test it existed (see useLiveLogin.ts's own
// comment) -- demoMode still defaults true and demo login is unchanged.
interface SessionState {
  demoMode: boolean;
  profile: Profile | null;
  login(role: Role): void;
  // Sets a real, Supabase-Auth-backed session -- called only after
  // useLiveLogin.ts has already verified signInWithPassword succeeded and
  // fetched a real profiles row. Never call this directly from UI code.
  loginLive(profile: Profile): void;
  logout(): Promise<void>;
  // Merges a partial update into the current session's profile -- used
  // after a self-service edit (e.g. uploading a signature) so the change
  // is reflected immediately without a full re-login/refetch.
  setProfile(patch: Partial<Profile>): void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      demoMode: true,
      profile: null,
      login: (role) =>
        set({
          demoMode: true,
          profile:
            role === 'manager'
              ? { key: 'management', name: 'Management', role: 'manager', active: true }
              : { key: 'elias', name: 'Elias Torgbuivi', role: 'agent', active: true },
        }),
      loginLive: (profile) => set({ demoMode: false, profile }),
      logout: async () => {
        set({ profile: null });
        // Harmless no-op in demo mode (no real Supabase session ever
        // existed) -- always safe to call unconditionally rather than
        // branching on demoMode, which could drift out of sync with
        // whether a real session is actually live.
        try {
          await getSupabaseClient()?.auth.signOut();
        } catch {
          // Sign-out failing client-side (e.g. offline) shouldn't block
          // the local session from clearing -- the profile is already
          // gone above, so RequireAuth sends them to /login regardless.
        }
      },
      setProfile: (patch) => {
        const current = get().profile;
        if (!current) return;
        set({ profile: { ...current, ...patch } });
      },
    }),
    { name: 'pep_webnext_session' },
  ),
);
