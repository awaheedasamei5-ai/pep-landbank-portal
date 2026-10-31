import { PasswordRecoveryFinish } from "../../_components/password-recovery-finish";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">Choose a new password</h1>
          <p className="text-muted-foreground text-sm">Use a unique password of at least 12 characters.</p>
        </div>
        <PasswordRecoveryFinish />
      </div>
    </main>
  );
}
