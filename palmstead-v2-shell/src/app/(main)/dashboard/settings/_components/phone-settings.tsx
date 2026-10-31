"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requireSupabase } from "@/lib/supabase.client";

export function PhoneSettings() {
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void requireSupabase()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user?.phone_confirmed_at && data.user.phone) setVerifiedPhone(data.user.phone);
      });
  }, []);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = phone.replace(/[\s()-]/g, "");
    if (!/^\+233\d{9}$/.test(normalized) || pending) {
      setMessage("Enter a Ghana mobile number in +233 format.");
      return;
    }
    setPending(true);
    setMessage("");
    const { error } = await requireSupabase().auth.updateUser({ phone: normalized });
    if (error) setMessage("A verification code could not be sent. Please try again later.");
    else {
      setPhone(normalized);
      setSent(true);
      setMessage("Enter the code sent to your new number. Your current contact number stays in place until verified.");
    }
    setPending(false);
  }

  async function confirmCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6,8}$/.test(code) || pending) return;
    setPending(true);
    setMessage("");
    const client = requireSupabase();
    const { error } = await client.auth.verifyOtp({ phone, token: code, type: "phone_change" });
    if (error) {
      setMessage("The code is invalid or expired. Request a new code and try again.");
    } else {
      const { error: syncError } = await client.rpc("sync_verified_profile_phone");
      if (syncError)
        setMessage("Phone verified for sign-in, but the staff contact record could not update. Contact Management.");
      else {
        setVerifiedPhone(phone);
        setPhone("");
        setCode("");
        setSent(false);
        setMessage("Your verified phone is ready for sign-in and staff SMS.");
      }
    }
    setPending(false);
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Phone verification</CardTitle>
        <CardDescription>
          Verify your own phone before using SMS sign-in or receiving staff messages there.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {verifiedPhone ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">Verified</Badge>
            {verifiedPhone}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">No verified sign-in phone yet.</p>
        )}
        <form onSubmit={requestCode} className="flex flex-col gap-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="verify-new-phone">New Ghana phone</FieldLabel>
              <Input
                id="verify-new-phone"
                type="tel"
                autoComplete="tel"
                placeholder="+233XXXXXXXXX"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={pending}>
            {pending ? "Please wait…" : "Send verification code"}
          </Button>
        </form>
        {sent && (
          <form onSubmit={confirmCode} className="flex flex-col gap-3">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="verify-phone-code">SMS code</FieldLabel>
                <Input
                  id="verify-phone-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  required
                />
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={pending}>
              {pending ? "Checking…" : "Verify phone"}
            </Button>
          </form>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
