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
// account mid-session). Verified once per app load, so a stale persisted
// profile never keeps rendering an authenticated shell whose queries
// would all immediately fail RLS.
//
// Real user ask (2026-09-11): "when u click on any app or function the
// system, the risponce time is too long, make the app fast with one
// touch responds at all ends of the system." This used to BLOCK the
// entire dashboard shell behind a full-screen "Checking your session…"
// spinner on every single load/reload, waiting on two sequential
// Supabase round trips (a session check, then a separate `profiles`
// SELECT) before rendering anything at all -- even though the persisted
// `profile` (zustand, rehydrated from localStorage synchronously before
// first paint) already had everything needed to show the real shell
// immediately in the overwhelmingly common case: a still-valid session.
// Now it renders optimistically off that persisted profile right away
// and verifies in the background -- only actually revoking access (sign
// out + redirect) if that verification comes back bad. RLS is the real
// security boundary regardless (every query still fails server-side for
// an invalid session no matter what the client optimistically shows),
// so this trades nothing away except the previously enforced belt on top
// of that already-enforced RLS suspenders -- same class of tradeoff the
// file's own comment below already accepts for the client-side redirect.
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const loginLive = useAuthStore((s) => s.loginLive);
  // Starts false on BOTH server and client renders -- zustand's persist
  // rehydrates from localStorage synchronously at module load, but only
  // once real client JS runs; the server-rendered HTML (and React's
  // first client render during hydration) has no localStorage at all, so
  // this must match that same starting state or hydration mismatches.
  // The effect below flips it almost immediately (one render tick, not a
  // network round trip) once `profile` is confirmed present client-side.
  const [ready, setReady] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only check -- fires once on the client after hydration, re-reading the freshly-rehydrated profile is the point.
  useEffect(() => {
    if (useAuthStore.getState().profile) setReady(true);
  }, []);

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
