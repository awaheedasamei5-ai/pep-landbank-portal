"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { loadActiveStaffProfile } from "@/lib/palmstead/use-live-login";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

export function OAuthCallback() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const client = requireSupabase();
      const { data, error: authError } = await client.auth.getUser();
      if (authError || !data.user) throw new Error("Google sign-in could not be completed.");
      const profile = await loadActiveStaffProfile(data.user.id);
      if (!cancelled) {
        useAuthStore.getState().loginLive(profile);
        router.replace("/dashboard/default");
      }
    })().catch(async () => {
      await requireSupabase().auth.signOut();
      if (!cancelled) setError("This Google account is not linked to an active invited staff account.");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="font-semibold text-xl">Checking staff access</h1>
      <p role={error ? "alert" : "status"} className="text-muted-foreground text-sm">
        {error || "Finishing your sign-in…"}
      </p>
      {error && (
        <Link className="text-primary text-sm hover:underline" href="/auth/v1/login">
          Back to sign in
        </Link>
      )}
    </main>
  );
}
