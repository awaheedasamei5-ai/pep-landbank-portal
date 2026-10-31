"use client";

import { useMutation } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";
import { friendlyFunctionsInvokeError } from "@/webnext/shared/lib/friendlyError";

import type { ChatMessage } from "./use-chat";

// Real "intelligence" touchpoint for Chat (13-chat-whatsapp-grade-rebuild.md):
// one suggested reply, drafted by the shared ai-insights Edge Function
// (kind="chat_reply_suggestion", added alongside this feature) from the
// real last few messages in the thread -- the user edits or discards it
// before sending, same "never sent automatically" discipline every other
// kind in that function already follows.
export function useSuggestReply(myKey: string | undefined, partnerName: string | undefined) {
  return useMutation({
    mutationFn: async (recentMessages: ChatMessage[]): Promise<string> => {
      const sb = requireSupabase();
      const { data, error } = await sb.functions.invoke("ai-insights", {
        body: {
          kind: "chat_reply_suggestion",
          context: {
            partnerName: partnerName?.split(" ")[0] ?? "",
            recentMessages: recentMessages.slice(-6).map((m) => ({
              fromMe: m.senderKey === myKey,
              text: m.body || `[${m.kind ?? "attachment"}]`,
            })),
          },
        },
      });
      if (error) throw new Error(await friendlyFunctionsInvokeError(error, "Could not suggest a reply right now."));
      return String(data?.message ?? "").trim();
    },
  });
}
