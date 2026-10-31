import Link from "next/link";

import { PasswordRecoveryRequest } from "../../_components/password-recovery-request";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">Reset your password</h1>
          <p className="text-muted-foreground text-sm">
            Enter your staff email. If an account exists, we will send a secure reset link.
          </p>
        </div>
        <PasswordRecoveryRequest />
        <Link className="text-primary text-sm hover:underline" href="/auth/v1/login">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
