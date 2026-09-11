import { Landmark } from "lucide-react";

import { LoginForm } from "../../_components/login-form";

// Palmstead's real sign-in screen. No self-registration and no OAuth --
// staff accounts are provisioned by Management (real `profiles` row per
// staff member), matching v1/web-next's own access model exactly.
export default function LoginV1() {
  return (
    <div className="flex h-dvh">
      <div className="hidden bg-primary lg:block lg:w-1/3">
        <div className="flex h-full flex-col items-center justify-center p-12 text-center">
          <div className="space-y-6">
            <Landmark className="mx-auto size-12 text-primary-foreground" />
            <div className="space-y-2">
              <h1 className="font-light text-5xl text-primary-foreground">Palmstead</h1>
              <p className="text-primary-foreground/80 text-xl">Sign in to your staff account</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-2/3">
        <div className="w-full max-w-md space-y-10 py-24 lg:py-32">
          <div className="space-y-4 text-center">
            <div className="font-medium tracking-tight">Sign in</div>
            <div className="mx-auto max-w-xl text-muted-foreground">
              Use the email and password Management set up for you.
            </div>
          </div>
          <div className="space-y-4">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
