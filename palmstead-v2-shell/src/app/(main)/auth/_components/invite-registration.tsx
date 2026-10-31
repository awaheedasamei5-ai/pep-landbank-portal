"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requireSupabase } from "@/lib/supabase.client";

export function InviteRegistration() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");

  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (password.length < 12 || password !== confirm) {
      setMessage("Use at least 12 characters and make sure the passwords match.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      await requireSupabase().auth.signUp({ email: email.trim(), password });
      setSubmitted(true);
      setPassword("");
      setConfirm("");
    } catch {
      // Keep the same public response for invited, existing and unknown addresses.
      setSubmitted(true);
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        If this email was invited, follow the confirmation email, then sign in. If no email arrives, contact Management.
      </p>
    );
  }

  return (
    <form onSubmit={register} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invite-email">Invited staff email</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-password">New password</FieldLabel>
          <Input
            id="invite-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-confirm">Confirm password</FieldLabel>
          <Input
            id="invite-confirm"
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
        {pending ? "Creating account…" : "Create staff account"}
      </Button>
      {message && (
        <p role="alert" className="text-destructive text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
