"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SubscriptionProvider } from "./context/SubscriptionContext";
import { ToastProvider } from "./context/ToastContext";
import { ensureOpenHrRealtimeStarted } from "./services/realtime";

function RealtimeStarter({ children }: { children: ReactNode }) {
  useEffect(() => {
    ensureOpenHrRealtimeStarted();
  }, []);
  return <>{children}</>;
}

export function OpenHrProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <ToastProvider>
          <RealtimeStarter>{children}</RealtimeStarter>
        </ToastProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export { useAuth };
