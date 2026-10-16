"use client";

import { useEffect, useMemo } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real WhatsApp-style message reactions (13-chat-whatsapp-grade-rebuild.md).
// One reaction per staff member per message -- picking a new emoji replaces
// your own, tapping your own again removes it, matching real WhatsApp.
export interface ReactionGroup {
  emoji: string;
  count: number;
  staffNames: string[];
  mine: boolean;
}

type RawReaction = { message_id: string; staff_key: string; staff_name: string; emoji: string };

function groupReactions(rows: RawReaction[], myKey: string | undefined): Map<string, ReactionGroup[]> {
  const byMessage = new Map<string, RawReaction[]>();
  for (const r of rows) {
    const list = byMessage.get(r.message_id) ?? [];
    list.push(r);
    byMessage.set(r.message_id, list);
  }
  const result = new Map<string, ReactionGroup[]>();
  for (const [messageId, reactions] of byMessage) {
    const byEmoji = new Map<string, RawReaction[]>();
    for (const r of reactions) {
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r);
      byEmoji.set(r.emoji, list);
    }
    const groups: ReactionGroup[] = Array.from(byEmoji.entries()).map(([emoji, rs]) => ({
      emoji,
      count: rs.length,
      staffNames: rs.map((r) => r.staff_name),
      mine: rs.some((r) => r.staff_key === myKey),
    }));
    result.set(messageId, groups);
  }
  return result;
}

export function useMessageReactions(myKey: string | undefined, messageIds: string[]) {
  const qc = useQueryClient();
  const idsKey = messageIds.join(",");

  const query = useQuery({
    queryKey: ["chat-reactions", idsKey],
    enabled: messageIds.length > 0,
    queryFn: async (): Promise<Map<string, ReactionGroup[]>> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("chat_message_reactions").select("message_id,staff_key,staff_name,emoji").in("message_id", messageIds);
      if (error) throw error;
      return groupReactions((data ?? []) as RawReaction[], myKey);
    },
  });

  useEffect(() => {
    if (!messageIds.length) return;
    const sb = requireSupabase();
    const channel = sb
      .channel(`chat-reactions-${idsKey.slice(0, 40)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reactions" }, () => {
        qc.invalidateQueries({ queryKey: ["chat-reactions", idsKey] });
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey already encodes messageIds
  }, [idsKey, qc]);

  return query.data ?? new Map<string, ReactionGroup[]>();
}

export function useSetReaction(myKey: string | undefined, myName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: string; emoji: string; alreadyMine: boolean }) => {
      if (!myKey) return;
      const sb = requireSupabase();
      if (input.alreadyMine) {
        const { error } = await sb.from("chat_message_reactions").delete().eq("message_id", input.messageId).eq("staff_key", myKey);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("chat_message_reactions")
          .upsert({ message_id: input.messageId, staff_key: myKey, staff_name: myName ?? "", emoji: input.emoji }, { onConflict: "message_id,staff_key" });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-reactions"] }),
  });
}

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
