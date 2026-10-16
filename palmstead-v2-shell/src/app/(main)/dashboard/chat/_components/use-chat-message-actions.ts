"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

import type { ChatMessage } from "./use-chat";

// Real WhatsApp message/chat-level actions (15-chat-whatsapp-full-replica.md):
// star (personal), delete for everyone / delete for me, forward, and
// per-chat archive/mute/pin. Quote-reply uses the schema's own existing
// reply_to_id column (unused until now, wired directly into useSendMessage
// / useSendGroupMessage's insert payload in the thread components).

// --- Star ---

export function useMyStarredMessageIds(myKey: string | undefined) {
  return useQuery({
    queryKey: ["chat-starred-ids", myKey],
    enabled: Boolean(myKey),
    queryFn: async (): Promise<Set<string>> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("chat_starred_messages").select("message_id").eq("staff_key", myKey as string);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.message_id as string));
    },
  });
}

export function useToggleStar(myKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: string; starred: boolean }) => {
      if (!myKey) return;
      const sb = requireSupabase();
      if (input.starred) {
        const { error } = await sb.from("chat_starred_messages").delete().eq("message_id", input.messageId).eq("staff_key", myKey);
        if (error) throw error;
      } else {
        const { error } = await sb.from("chat_starred_messages").upsert({ message_id: input.messageId, staff_key: myKey });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-starred-ids", myKey] }),
  });
}

// --- Delete for everyone / delete for me ---

// Matches real WhatsApp's own real-ish window (it's ~2 days there; this
// project's internal tool keeps a tighter, safer default since these are
// real work conversations, not casual chat).
export const DELETE_FOR_EVERYONE_WINDOW_MS = 15 * 60 * 1000;

export function canDeleteForEveryone(message: ChatMessage, myKey: string | undefined): boolean {
  return message.senderKey === myKey && Date.now() - new Date(message.createdAt).getTime() < DELETE_FOR_EVERYONE_WINDOW_MS;
}

export function useDeleteForEveryone(onDone: () => void) {
  return useMutation({
    mutationFn: async (message: Pick<ChatMessage, "id" | "attachmentUrl">) => {
      const sb = requireSupabase();
      const { error } = await sb.from("messages").delete().eq("id", message.id);
      if (error) throw error;
      if (message.attachmentUrl) await sb.storage.from("chat-attachments").remove([message.attachmentUrl]);
    },
    onSuccess: onDone,
  });
}

export function useMyHiddenMessageIds(myKey: string | undefined) {
  return useQuery({
    queryKey: ["chat-hidden-ids", myKey],
    enabled: Boolean(myKey),
    queryFn: async (): Promise<Set<string>> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("chat_message_hides").select("message_id").eq("staff_key", myKey as string);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.message_id as string));
    },
  });
}

export function useDeleteForMe(myKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!myKey) return;
      const sb = requireSupabase();
      const { error } = await sb.from("chat_message_hides").upsert({ message_id: messageId, staff_key: myKey });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-hidden-ids", myKey] }),
  });
}

// --- Forward ---

export function useForwardMessage(myKey: string | undefined, myName: string | undefined) {
  return useMutation({
    mutationFn: async (input: { message: ChatMessage; toRecipientKey?: string; toGroupId?: string }) => {
      if (!myKey) throw new Error("Not signed in.");
      const sb = requireSupabase();
      const { error } = await sb.from("messages").insert({
        sender_key: myKey,
        sender_name: myName,
        recipient_key: input.toRecipientKey ?? null,
        group_id: input.toGroupId ?? null,
        body: input.message.body,
        read: Boolean(input.toGroupId),
        forwarded: true,
        kind: input.message.kind,
        attachment_data: input.message.attachmentData,
        attachment_type: input.message.attachmentType,
        attachment_name: input.message.attachmentName,
        attachment_url: input.message.attachmentUrl,
        attachment_size_bytes: input.message.attachmentSizeBytes,
        attachment_duration_seconds: input.message.attachmentDurationSeconds,
        location_lat: input.message.locationLat,
        location_lng: input.message.locationLng,
        location_label: input.message.locationLabel,
      });
      if (error) throw error;
    },
  });
}

// --- Archive / mute / pin ---

export interface ConversationSettings {
  archived: boolean;
  muted: boolean;
  pinned: boolean;
}

export function useConversationSettingsMap(myKey: string | undefined) {
  return useQuery({
    queryKey: ["chat-conv-settings", myKey],
    enabled: Boolean(myKey),
    queryFn: async (): Promise<Map<string, ConversationSettings>> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("chat_conversation_settings").select("*").eq("staff_key", myKey as string);
      if (error) throw error;
      const map = new Map<string, ConversationSettings>();
      for (const row of data ?? []) {
        map.set(row.conversation_key as string, { archived: row.archived as boolean, muted: row.muted as boolean, pinned: row.pinned as boolean });
      }
      return map;
    },
  });
}

export function useSetConversationSetting(myKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversationKey: string; patch: Partial<ConversationSettings> }) => {
      if (!myKey) return;
      const sb = requireSupabase();
      const { error } = await sb
        .from("chat_conversation_settings")
        .upsert({ staff_key: myKey, conversation_key: input.conversationKey, ...input.patch }, { onConflict: "staff_key,conversation_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-conv-settings", myKey] }),
  });
}
