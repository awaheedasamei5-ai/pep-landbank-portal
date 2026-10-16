"use client";

import { useEffect, useMemo } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Chat (11-chat-plan.md). The messages table + RLS already existed
// live in sbydzrlzqxcdbudjaube before this app was built (same real DM
// backend V1's own Chat and cross-app notification sends already use) --
// UI-layer work on an already-correct backend, no schema change.
export interface ChatMessage {
  id: string;
  senderKey: string;
  senderName: string;
  recipientKey: string | null;
  body: string;
  createdAt: string;
  read: boolean;
  attachmentData: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
}

type RawMessage = {
  id: string;
  sender_key: string;
  sender_name: string;
  recipient_key: string | null;
  body: string;
  created_at: string;
  read: boolean;
  attachment_data: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
};

function mapMessage(r: RawMessage): ChatMessage {
  return {
    id: r.id,
    senderKey: r.sender_key,
    senderName: r.sender_name,
    recipientKey: r.recipient_key,
    body: r.body,
    createdAt: r.created_at,
    read: r.read,
    attachmentData: r.attachment_data,
    attachmentType: r.attachment_type,
    attachmentName: r.attachment_name,
  };
}

// RLS already restricts every row to {sender_key = me} OR {recipient_key = me} --
// this one query returns every DM the signed-in user is party to, then we
// group it client-side into per-partner threads (the security boundary is
// the RLS policy, this grouping is presentation only).
export function useAllMyMessages(myKey: string | undefined) {
  return useQuery({
    queryKey: ["chat-messages", myKey],
    enabled: Boolean(myKey),
    queryFn: async (): Promise<ChatMessage[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("messages").select("*").order("created_at", { ascending: true }).limit(1000);
      if (error) throw error;
      return (data ?? []).map(mapMessage);
    },
  });
}

export interface ChatThread {
  partnerKey: string;
  partnerName: string;
  messages: ChatMessage[];
  lastMessage: ChatMessage;
  unreadCount: number;
}

export function useChatThreads(myKey: string | undefined, directoryByKey: Map<string, string>) {
  const { data: messages, isLoading } = useAllMyMessages(myKey);

  const threads = useMemo((): ChatThread[] => {
    if (!messages || !myKey) return [];
    const byPartner = new Map<string, ChatMessage[]>();
    for (const m of messages) {
      const partnerKey = m.senderKey === myKey ? (m.recipientKey ?? "") : m.senderKey;
      if (!partnerKey) continue;
      const list = byPartner.get(partnerKey) ?? [];
      list.push(m);
      byPartner.set(partnerKey, list);
    }
    const result: ChatThread[] = [];
    for (const [partnerKey, msgs] of byPartner) {
      const sorted = [...msgs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = sorted[sorted.length - 1];
      result.push({
        partnerKey,
        partnerName: directoryByKey.get(partnerKey) ?? sorted.find((m) => m.senderKey === partnerKey)?.senderName ?? partnerKey,
        messages: sorted,
        lastMessage: last,
        unreadCount: sorted.filter((m) => m.senderKey === partnerKey && !m.read).length,
      });
    }
    return result.sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt));
  }, [messages, myKey, directoryByKey]);

  return { threads, isLoading };
}

export function useSendMessage(myKey: string | undefined, myName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { recipientKey: string; body: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("messages").insert({
        sender_key: myKey,
        sender_name: myName,
        recipient_key: input.recipientKey,
        body: input.body,
        read: false,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-messages", myKey] }),
  });
}

export function useMarkThreadRead(myKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partnerKey: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("messages").update({ read: true }).eq("sender_key", partnerKey).eq("recipient_key", myKey as string).eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-messages", myKey] }),
  });
}

export function useDeleteMessage(myKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-messages", myKey] }),
  });
}

// Real Supabase Realtime subscription, matching V1's own subscribeToChat --
// new messages and read-state changes refresh the open thread/thread list
// without a reload.
export function useChatRealtime(myKey: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!myKey) return;
    const sb = requireSupabase();
    const channel = sb
      .channel(`chat-${myKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["chat-messages", myKey] });
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [myKey, qc]);
}
