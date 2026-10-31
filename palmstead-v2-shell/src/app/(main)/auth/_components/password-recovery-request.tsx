"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requireSupabase } from "@/lib/supabase.client";

export function PasswordRecoveryRequest() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || Date.now() < cooldownUntil) return;
    setPending(true);
    try {
      const redirectTo = `${window.location.origin}/auth/v1/reset-password`;
      await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    } catch {
      // Recovery deliberately gives the same response for unknown users and delivery failures.
    } finally {
      setSent(true);
      setCooldownUntil(Date.now() + 60_000);
      window.setTimeout(() => setCooldownUntil(0), 60_000);
      setPending(false);
    }
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="recovery-email">Staff email</FieldLabel>
          <Input
            id="recovery-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending || Date.now() < cooldownUntil}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      {sent && (
        <p role="status" className="text-muted-foreground text-sm">
          If this email belongs to a staff account, a reset link is on its way. Check your inbox and spam folder.
        </p>
      )}
    </form>
  );
}
