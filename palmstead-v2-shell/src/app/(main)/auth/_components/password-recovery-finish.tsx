"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requireSupabase } from "@/lib/supabase.client";

export function PasswordRecoveryFinish() {
  const [recovery, setRecovery] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    const client = requireSupabase();
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setChecking(false);
      } else if (event === "INITIAL_SESSION") {
        setChecking(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function update(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recovery || pending) return;
    if (password.length < 12 || password !== confirm) {
      setResult("Use at least 12 characters and make sure both passwords match.");
      return;
    }
    setPending(true);
    setResult("");
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      setResult("This link could not reset your password. Request a new link and try again.");
    } else {
      await client.auth.signOut();
      setResult("Password changed. You can now sign in with your new password.");
      setRecovery(false);
      setPassword("");
      setConfirm("");
    }
    setPending(false);
  }

  if (checking)
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Checking reset link…
      </p>
    );
  return (
    <div className="flex flex-col gap-4">
      {recovery && (
        <form onSubmit={update} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={pending}>
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
      {!recovery && !result && (
        <p className="text-muted-foreground text-sm">This link is invalid or expired. Request a fresh link.</p>
      )}
      {result && (
        <p role="status" className="text-sm">
          {result}
        </p>
      )}
      <Link
        className="text-primary text-sm hover:underline"
        href={recovery ? "/auth/v1/login" : "/auth/v1/forgot-password"}
      >
        {recovery ? "Back to sign in" : "Request a new link"}
      </Link>
    </div>
  );
}
