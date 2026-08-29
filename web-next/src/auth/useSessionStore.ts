import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile, Role } from '../types/domain';

// Replaces index.html's bare `sb`/`LIVE_MODE`/`DEMO_MODE`/`PROFILE` globals
// (index.html:2049) with one persisted store. Phase 1 only ever writes
// demoMode:true (see auth/LoginScreen.tsx) -- the shape supports live mode
// now so it doesn't need retrofitting when that's wired up.
interface SessionState {
  demoMode: boolean;
  profile: Profile | null;
  login(role: Role): void;
  logout(): void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      demoMode: true,
      profile: null,
      login: (role) =>
        set({
          demoMode: true,
          profile:
            role === 'manager'
              ? { key: 'management', name: 'Management', role: 'manager' }
              : { key: 'elias', name: 'Elias Torgbuivi', role: 'agent' },
        }),
      logout: () => set({ profile: null }),
    }),
    { name: 'pep_webnext_session' },
  ),
);
