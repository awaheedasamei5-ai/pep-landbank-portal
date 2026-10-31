import Link from "next/link";

import { InviteRegistration } from "../../_components/invite-registration";

export default function RegisterV1() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">Join Palmstead</h1>
          <p className="text-muted-foreground text-sm">
            Use the staff email Management invited. Your account will inherit the access set for your role.
          </p>
        </div>
        <InviteRegistration />
        <Link className="text-primary text-sm hover:underline" href="/auth/v1/login">
          Already have an account? Sign in
        </Link>
      </div>
    </main>
  );
}
