"use client";

// Shim, not copied from OpenHRApp -- Palmstead already has its own real auth
// (src/stores/auth/auth-store.ts, real signInWithPassword + profiles lookup,
// built earlier this build). This exposes the SAME useAuth()/user shape every
// copied OpenHR component/hook/service expects (OpenHRApp's own User type,
// src/openhr/types.ts), backed by that real store, instead of duplicating
// OpenHRApp's own AuthContext (which assumes its own multi-tenant
// organizations/auth.users row shape Palmstead doesn't have). Same technique
// already proven for the Sales-desk web-next port's useSessionStore shim --
// see palmstead-v2-shell docs/plans and feedback-literal-copy-not-rewrite.
//
// Field mapping, and what's still a placeholder pending the real "twist to
// fit" pass (not silently invented -- flagged here, in one place):
// - id/employeeId: Palmstead's real identity is `profile.key` (a short slug
//   like "elias"), not a uuid -- used for both until/unless something here
//   genuinely needs the real auth.users uuid (most of OpenHRApp's own code
//   only uses this id as an opaque foreign key, so a stable string works).
// - organizationId: Palmstead is single-org; every copied query that filters
//   by organization_id needs that filter either removed or pointed at a
//   fixed constant once the real schema reconciliation (attendance_log vs
//   OpenHRApp's own `attendance` table) happens -- NOT done yet, see the
//   PORT_STATUS note in this folder.
// - shiftId/teamId/department/designation: Palmstead's real Profile type
//   doesn't carry these yet -- default to undefined/empty until Staff
//   Settings (item 3) or this item's own "twist" pass adds them for real,
//   rather than fabricate values nobody set.
import { createContext, useContext, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth/auth-store";
import type { User } from "../types";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const profile = useAuthStore((s) => s.profile);

  const user: User | null = profile
    ? {
        id: profile.key,
        employeeId: profile.key,
        name: profile.name,
        email: profile.email ?? "",
        role: profile.role === "manager" ? "ADMIN" : "EMPLOYEE",
        department: "",
        designation: "",
        organizationId: "palmstead",
      }
    : null;

  return <AuthContext.Provider value={{ user, isLoading: false }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
