"use client";

import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { friendlyError, useOutgoingSmsGuard } from "./use-outgoing-sms";

export function OutgoingSmsGuard({ children }: { children: ReactNode }) {
  const guard = useOutgoingSmsGuard();
  if (guard.isLoading) return <Skeleton className="h-40 w-full" />;
  if (guard.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
        {friendlyError(guard.error)}
      </div>
    );
  }
  return <>{children}</>;
}
