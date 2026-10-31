"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { requireSupabase } from "@/lib/supabase.client";

export function GoogleSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (pending) return;
    setPending(true);
    setError("");
    const redirectTo = `${window.location.origin}/auth/v1/oauth/callback`;
    const { error: signInError } = await requireSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (signInError) {
      setError("Google sign-in is unavailable. Use your staff email and password.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" disabled={pending} onClick={() => void start()}>
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
