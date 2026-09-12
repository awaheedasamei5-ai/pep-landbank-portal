import { LoginForm } from "../../_components/login-form";
import { LoginVideoPanel } from "./login-video-panel";

// Palmstead's real sign-in screen. No self-registration and no OAuth --
// staff accounts are provisioned by Management (real `profiles` row per
// staff member), matching v1/web-next's own access model exactly.
//
// Real user ask (2026-09-11): replace the plain blue panel with a real
// video background, and drop the "Sign in to your staff account" line.
// v1's own real source has no such video anywhere (confirmed via an
// exhaustive grep across both its main and redesign branches) -- this
// is new work built from the two video files the user attached directly
// in chat, not a port. See login-video-panel.tsx for why there are two
// and how the choice between them is made. autoPlay+muted+loop+
// playsInline is the standard combination every browser actually allows
// to autoplay without a user gesture; a dark gradient overlay keeps the
// logo legible over whatever the footage looks like at any given frame.
export default function LoginV1() {
  return (
    <div className="flex h-dvh">
      <div className="relative hidden overflow-hidden bg-primary lg:block lg:w-1/3">
        <LoginVideoPanel />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />
        <div className="relative flex h-full flex-col items-center justify-center p-12 text-center">
          {/* Real user ask (2026-09-11): replace the orange circular logo
              + "Palmstead" text with the real white wordmark PNG,
              centered. The wordmark already carries the name, so the
              separate <h1> text is dropped rather than duplicated. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- small fixed-size mark on a static page, not worth next/image's config */}
          <img src="/logo-white.png" alt="Palmstead" className="mx-auto w-64" />
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
