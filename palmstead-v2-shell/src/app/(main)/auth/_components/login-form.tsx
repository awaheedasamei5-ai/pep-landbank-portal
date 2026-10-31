"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useLiveLogin } from "@/lib/palmstead/use-live-login";

import { GoogleSignIn } from "./google-sign-in";
import { PhoneOtpLogin } from "./phone-otp-login";

const formSchema = z.object({
  email: z.email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

export function LoginForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [usePhone, setUsePhone] = useState(false);
  const { login, isPending } = useLiveLogin();
  useEffect(() => setReady(true), []);
  const disabled = !ready || isPending;
  const phoneEnabled = process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === "true";
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Real Supabase Auth sign-in (see use-live-login.ts) -- the toast-only
  // stub this form shipped with is gone; a wrong password surfaces
  // GoTrue's own real error message via toast instead of silently
  // "succeeding" against no backend.
  async function onSubmit(data: z.infer<typeof formSchema>) {
    const profile = await login(data.email, data.password);
    if (!profile) {
      toast.error("Couldn't sign in", { description: "Check your email and password and try again." });
      return;
    }
    router.push("/dashboard/default");
  }

  let submitLabel = "Login";
  if (!ready) submitLabel = "Preparing sign-in…";
  else if (isPending) submitLabel = "Signing in…";

  if (usePhone && phoneEnabled) {
    return <PhoneOtpLogin onBack={() => setUsePhone(false)} />;
  }

  return (
    <form
      method="post"
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      aria-busy={disabled}
      className="flex flex-col gap-4"
    >
      <FieldGroup className="gap-4">
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid} data-disabled={disabled}>
              <FieldLabel htmlFor="login-email">Email Address</FieldLabel>
              <Input
                {...field}
                id="login-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                disabled={disabled}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid} data-disabled={disabled}>
              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <Input
                {...field}
                id="login-password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={disabled}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <Link className="self-end text-primary text-sm hover:underline" href="/auth/v1/forgot-password">
        Forgot password?
      </Link>
      <Button className="w-full" type="submit" disabled={disabled}>
        {submitLabel}
      </Button>
      {phoneEnabled && (
        <Button type="button" variant="outline" onClick={() => setUsePhone(true)}>
          Sign in with a phone code
        </Button>
      )}
      {process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN_ENABLED === "true" && <GoogleSignIn />}
      <Link className="text-center text-primary text-sm hover:underline" href="/auth/v1/register">
        Invited staff? Create your account
      </Link>
      <noscript>Enable JavaScript to sign in securely.</noscript>
    </form>
  );
}
