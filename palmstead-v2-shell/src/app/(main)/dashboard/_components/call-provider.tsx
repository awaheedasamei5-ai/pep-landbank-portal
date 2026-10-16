"use client";

import { createContext, useContext } from "react";

import { useAuthStore } from "@/stores/auth/auth-store";
import { ChatCallDialog } from "@/app/(main)/dashboard/chat/_components/chat-call-dialog";
import { useCallSignaling, type CallState } from "@/app/(main)/dashboard/chat/_components/use-call";

// Real fix for calls being "a UI gimmick": useCallSignaling used to be
// instantiated inside ChatScreen, so its always-on incoming-call listener
// (use-call.ts's personal `chat-calls-{myKey}` channel) only existed while
// the Chat page itself was open -- a call placed while the other person was
// anywhere else in the dashboard would never reach them. Mounted here
// instead, next to RealtimeBridge (the one real layout every authenticated
// page shares), the listener runs for the whole dashboard session, and an
// incoming call now rings no matter which screen you're on, the same way
// WhatsApp itself keeps ringing in the background.
const CallContext = createContext<CallState | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const profile = useAuthStore((s) => s.profile);
  const call = useCallSignaling(profile?.key, profile?.name);

  return (
    <CallContext.Provider value={call}>
      {children}
      <ChatCallDialog call={call} />
    </CallContext.Provider>
  );
}

export function useChatCall(): CallState {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useChatCall must be used within CallProvider");
  return ctx;
}
