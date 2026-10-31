"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loadActiveStaffProfile } from "@/lib/palmstead/use-live-login";
import { requireSupabase } from "@/lib/supabase.client";
import { useAuthStore } from "@/stores/auth/auth-store";

function normalizedPhone(raw: string): string | null {
  const value = raw.replace(/[\s()-]/g, "");
  return /^\+233\d{9}$/.test(value) ? value : null;
}

export function PhoneOtpLogin({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(false);
  let sendLabel = "Send code";
  if (sent) sendLabel = "Resend code";
  if (busy) sendLabel = "Please wait…";

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizedPhone(phone);
    if (!normalized || busy || cooldown) {
      setMessage("Enter a Ghana number in +233 format.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await requireSupabase().auth.signInWithOtp({
        phone: normalized,
        options: { shouldCreateUser: false },
      });
    } catch {
      // A delivery or network failure cannot reveal whether this phone is enrolled.
    }
    // Use the same public response for unknown, rate-limited and enrolled phones.
    setSent(true);
    setCooldown(true);
    window.setTimeout(() => setCooldown(false), 60_000);
    setMessage("If this is a verified staff sign-in number, a code is on its way.");
    setBusy(false);
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizedPhone(phone);
    if (!normalized || busy || !/^\d{6,8}$/.test(code)) {
      setMessage("Enter the code from your SMS.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { data, error } = await requireSupabase().auth.verifyOtp({ phone: normalized, token: code, type: "sms" });
    if (error || !data.user) {
      setMessage("The code is invalid or expired. Request a new code if needed.");
    } else {
      try {
        const profile = await loadActiveStaffProfile(data.user.id);
        useAuthStore.getState().loginLive(profile);
        router.replace("/dashboard/default");
      } catch {
        setMessage("This phone is not linked to an active staff account.");
      }
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={send} className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="login-phone">Verified staff phone</FieldLabel>
            <Input
              id="login-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+233XXXXXXXXX"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={busy || cooldown}>
          {sendLabel}
        </Button>
      </form>
      {sent && (
        <form onSubmit={verify} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="login-phone-code">SMS code</FieldLabel>
              <Input
                id="login-phone-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                required
              />
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </Button>
        </form>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <Button variant="ghost" type="button" onClick={onBack}>
        Use email and password
      </Button>
    </div>
  );
}
