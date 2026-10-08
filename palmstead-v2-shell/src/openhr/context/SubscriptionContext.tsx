"use client";

// Stub, not copied from OpenHRApp -- the real SubscriptionContext (see git
// history of this path before this change) is pure SaaS trial/billing gating
// (organization.service.ts's subscription status, read-only/blocked/ads
// states). Palmstead is a single internal company, not a multi-tenant SaaS
// product sold on a trial -- there is no subscription to check. Every copied
// OpenHR component calls useSubscription() for canPerformAction()/isLoading
// only as a write-gate, so this keeps that exact shape and always allows,
// rather than pulling in organization.service.ts's 688 lines for a concept
// that doesn't apply here. Per the OSS master instruction: "Remove: features
// that do not serve Palmstead."
import { createContext, useContext, type ReactNode } from "react";
import type { SubscriptionInfo } from "../types";

interface SubscriptionContextType {
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
  refreshSubscription: () => Promise<void>;
  canPerformAction: (action: "write" | "read") => boolean;
}

const ALWAYS_ACTIVE: SubscriptionInfo = {
  status: "ACTIVE",
  isSuperAdmin: false,
  isReadOnly: false,
  isBlocked: false,
  showAds: false,
  isDemo: false,
};

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: ALWAYS_ACTIVE,
  isLoading: false,
  refreshSubscription: async () => {},
  canPerformAction: () => true,
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  return (
    <SubscriptionContext.Provider
      value={{
        subscription: ALWAYS_ACTIVE,
        isLoading: false,
        refreshSubscription: async () => {},
        canPerformAction: () => true,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
