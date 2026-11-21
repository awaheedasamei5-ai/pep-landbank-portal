"use client";

import type { ReactNode } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth/auth-store";

import { useNavigationAccess, type NavigationPermission } from "./use-navigation-access";

export function AppViewGate({ children, permission, label }: {
  children: ReactNode;
  permission: NavigationPermission;
  label: string;
}) {
  const profile = useAuthStore((state) => state.profile);
  const isManager = profile?.role === "manager";
  const access = useNavigationAccess(profile?.key, isManager);

  if (isManager || access.data?.[permission] === true) return <>{children}</>;

  if (!profile || access.isPending) {
    return <div className="p-6 text-sm text-muted-foreground">Checking {label} access…</div>;
  }

  return (
    <section className="flex flex-col items-start gap-3 p-6" role="status">
      <h1 className="text-lg font-semibold">{access.isError ? "Access check unavailable" : "Access restricted"}</h1>
      <p className="text-sm text-muted-foreground">
        {access.isError
          ? `We could not check your ${label} access. Try again.`
          : `Your current role does not include ${label} access. Management can change this in Settings.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {access.isError && <Button variant="outline" onClick={() => void access.refetch()}>Try again</Button>}
        <Button asChild variant="outline"><Link href="/dashboard/default">Back to Home</Link></Button>
      </div>
    </section>
  );
}

