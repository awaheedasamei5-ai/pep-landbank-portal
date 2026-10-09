"use client";

import { useEffect } from "react";

import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

// Real presence for Directory's "who's online now" (item 2, B.1):
// profiles.last_seen_at already existed in the schema but nothing ever
// wrote to it -- dead infrastructure until this. Updates it on mount and
// every 60s while the app is open; Directory reads it back and treats
// anyone seen in the last 5 minutes as online (ONLINE_WINDOW_MS below).
const HEARTBEAT_INTERVAL_MS = 60_000;
export const ONLINE_WINDOW_MS = 5 * 60_000;

export function usePresenceHeartbeat() {
  const agentKey = useAuthStore((s) => s.profile?.key);

  useEffect(() => {
    if (!agentKey) return;
    const sb = requireSupabase();
    const beat = () => {
      sb.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("agent_key", agentKey).then();
    };
    beat();
    const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [agentKey]);
}
