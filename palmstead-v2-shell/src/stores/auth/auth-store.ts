import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Profile } from "@/lib/palmstead/types";
import { supabase } from "@/lib/supabase.client";

// Real Palmstead session -- same shape/discipline as web-next's own
// useSessionStore.ts (same `profiles` table, same demo/live split). A
// plain global store (not the per-request factory pattern preferences
// uses) is correct here: auth state is genuinely client-only and must
// persist across the whole browser session via localStorage, same as
// web-next's own `persist` usage -- there's no SSR-shared state to leak
// between requests.
interface AuthState {
  profile: Profile | null;
  loginLive: (profile: Profile) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      profile: null,
      loginLive: (profile) => set({ profile }),
      logout: async () => {
        set({ profile: null });
        try {
          await supabase?.auth.signOut();
        } catch {
          // Sign-out failing client-side (e.g. offline) shouldn't block
          // the local session from clearing.
        }
      },
    }),
    { name: "palmstead_v2_session" },
  ),
);
