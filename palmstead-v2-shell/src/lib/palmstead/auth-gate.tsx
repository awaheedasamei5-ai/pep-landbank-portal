"use client";

import { type ReactNode, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

// Direct port of web-next's src/auth/LiveSessionGate.tsx + the real-auth
// half of RequireRole: useAuthStore persists `profile` to localStorage,
// but the actual thing every RLS-gated query relies on is Supabase's OWN
// session token (a separate localStorage key it manages itself) -- those
// can drift (expired token, shared device, a manager deactivating the
// account mid-session). Checked once per app load, before the dashboard
// shell renders, so a stale persisted profile never renders an
// authenticated shell whose queries would all immediately fail RLS.
//
// Honestly not yet as strong as it should be: this is a client-side
// redirect, not server-side/middleware-enforced (Next's middleware can't
// read the browser-localStorage session the plain supabase-js client
// uses without switching to @supabase/ssr's cookie-based client) -- a
// determined user could see the shell flash before the redirect fires.
// Real enough to build every app behind for now; upgrading to cookie-
// based middleware gating is a real, separate, flagged improvement.
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const loginLive = useAuthStore((s) => s.loginLive);
  const [ready, setReady] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only check -- loginLive()/router.replace() below must not re-trigger this effect.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!supabase) {
        setReady(true);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        useAuthStore.setState({ profile: null });
        router.replace("/auth/v1/login");
        return;
      }
      const { data: row } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (cancelled) return;
      if (!row || row.active === false) {
        await supabase.auth.signOut();
        useAuthStore.setState({ profile: null });
        router.replace("/auth/v1/login");
        return;
      }
      loginLive({
        key: row.agent_key,
        name: row.name,
        role: row.role ?? "agent",
        email: row.email ?? undefined,
        active: row.active ?? true,
        signatureData: row.signature_data ?? null,
        phone: row.phone ?? undefined,
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted-foreground text-sm">
        {profile ? "Checking your session…" : "Redirecting to sign in…"}
      </div>
    );
  }
  return <>{children}</>;
}
