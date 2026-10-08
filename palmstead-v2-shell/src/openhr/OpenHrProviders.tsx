"use client";

import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SubscriptionProvider } from "./context/SubscriptionContext";
import { ToastProvider } from "./context/ToastContext";

export function OpenHrProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <ToastProvider>{children}</ToastProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export { useAuth };
