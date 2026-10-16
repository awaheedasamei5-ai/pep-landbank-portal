"use client";

import { useEffect, useMemo } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Chat (11-chat-plan.md) + full attachments (12-chat-attachments-plan.md).
// The messages table + RLS already existed live in sbydzrlzqxcdbudjaube before
// this app was built (same real DM backend V1's own Chat and cross-app
// notification sends already use). Legacy rows store attachments as base64 in
// attachment_data (V1's own pattern, still real production data); new sends
// go through the chat-attachments Storage bucket via attachment_url instead,
// so a voice note or video doesn't get stuffed into Postgres as base64.
export type AttachmentKind = "image" | "video" | "audio" | "file" | "location";

export interface ChatMessage {
  id: string;
  senderKey: string;
  senderName: string;
  recipientKey: string | null;
  body: string;
  createdAt: string;
  read: boolean;
  kind: AttachmentKind | null;
  attachmentData: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
  attachmentSizeBytes: number | null;
  attachmentDurationSeconds: number | null;
  locationLat: number | null;
  locationLng: number | null;
  locationLabel: string | null;
}

type RawMessage = {
  id: string;
  sender_key: string;
  sender_name: string;
  recipient_key: string | null;
  body: string;
  created_at: string;
  read: boolean;
  kind: string | null;
  attachment_data: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  attachment_url: string | null;
  attachment_size_bytes: number | null;
  attachment_duration_seconds: number | null;
  location_lat: number | null;
  location_lng: number | null;
  location_label: string | null;
};

const ATTACHMENT_KINDS = new Set(["image", "video", "audio", "file", "location"]);

function mapMessage(r: RawMessage): ChatMessage {
  return {
    id: r.id,
    senderKey: r.sender_key,
    senderName: r.sender_name,
    recipientKey: r.recipient_key,
    body: r.body,
    createdAt: r.created_at,
    read: r.read,
    kind: r.kind && ATTACHMENT_KINDS.has(r.kind) ? (r.kind as AttachmentKind) : null,
    attachmentData: r.attachment_data,
    attachmentType: r.attachment_type,
    attachmentName: r.attachment_name,
    attachmentUrl: r.attachment_url,
    attachmentSizeBytes: r.attachment_size_bytes,
    attachmentDurationSeconds: r.attachment_duration_seconds,
    locationLat: r.location_lat,
    locationLng: r.location_lng,
    locationLabel: r.location_label,
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
  // Undefined only for a synthetic, not-yet-sent "new chat" thread (no real
  // messages exist for it yet) -- see chat-screen.tsx's activeThread fallback.
  lastMessage: ChatMessage | undefined;
  unreadCount: number;
}

function previewText(m: ChatMessage): string {
  if (m.body) return m.body;
  switch (m.kind) {
    case "image":
      return "Photo";
    case "video":
      return "Video";
    case "audio":
      return "Voice note";
    case "location":
      return "Location";
    case "file":
      return m.attachmentName ?? "File";
    default:
      return "";
  }
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
    // Every thread built above comes from a non-empty message list, so
    // lastMessage is always real here -- only chat-screen.tsx's synthetic
    // "new chat, no messages yet" thread can have an undefined one, and it
    // never flows through this function.
    return result.sort((a, b) => b.lastMessage!.createdAt.localeCompare(a.lastMessage!.createdAt));
  }, [messages, myKey, directoryByKey]);

  return { threads, isLoading };
}

// Object path convention: {keyA}/{keyB}/{messageId}-{filename}, both
// participant keys always written in sorted order so either side's storage
// policy check -- (storage.foldername(name))[1] = my_key() OR [2] = my_key()
// -- matches regardless of who's sending.
function attachmentPath(myKey: string, partnerKey: string, filename: string): string {
  const [a, b] = [myKey, partnerKey].sort();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${a}/${b}/${crypto.randomUUID()}-${safeName}`;
}

async function uploadChatAttachment(myKey: string, partnerKey: string, file: File): Promise<{ path: string; sizeBytes: number }> {
  const sb = requireSupabase();
  const path = attachmentPath(myKey, partnerKey, file.name);
  const { error } = await sb.storage.from("chat-attachments").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return { path, sizeBytes: file.size };
}

function attachmentKindFromMime(mime: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

// Signed URLs are the real read-time gate for new (Storage-backed) attachments
// -- fetched lazily per message, cached for most of their real validity window.
export function useAttachmentSignedUrl(path: string | null) {
  return useQuery({
    queryKey: ["chat-attachment-url", path],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<string> => {
      const sb = requireSupabase();
      const { data, error } = await sb.storage.from("chat-attachments").createSignedUrl(path as string, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

interface SendMessageInput {
  recipientKey: string;
  body: string;
  attachmentFile?: File;
  attachmentDurationSeconds?: number;
  location?: { lat: number; lng: number; label: string | null };
}

export function useSendMessage(myKey: string | undefined, myName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMessageInput) => {
      if (!myKey) throw new Error("Not signed in.");
      const sb = requireSupabase();

      if (input.location) {
        const { error } = await sb.from("messages").insert({
          sender_key: myKey,
          sender_name: myName,
          recipient_key: input.recipientKey,
          body: input.body,
          read: false,
          kind: "location",
          location_lat: input.location.lat,
          location_lng: input.location.lng,
          location_label: input.location.label,
        });
        if (error) throw error;
        return;
      }

      if (input.attachmentFile) {
        const { path, sizeBytes } = await uploadChatAttachment(myKey, input.recipientKey, input.attachmentFile);
        const { error } = await sb.from("messages").insert({
          sender_key: myKey,
          sender_name: myName,
          recipient_key: input.recipientKey,
          body: input.body,
          read: false,
          kind: attachmentKindFromMime(input.attachmentFile.type),
          attachment_url: path,
          attachment_name: input.attachmentFile.name,
          attachment_type: input.attachmentFile.type || null,
          attachment_size_bytes: sizeBytes,
          attachment_duration_seconds: input.attachmentDurationSeconds ?? null,
        });
        if (error) throw error;
        return;
      }

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
    mutationFn: async (message: Pick<ChatMessage, "id" | "attachmentUrl">) => {
      const sb = requireSupabase();
      const { error } = await sb.from("messages").delete().eq("id", message.id);
      if (error) throw error;
      if (message.attachmentUrl) {
        await sb.storage.from("chat-attachments").remove([message.attachmentUrl]);
      }
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

export { previewText };
