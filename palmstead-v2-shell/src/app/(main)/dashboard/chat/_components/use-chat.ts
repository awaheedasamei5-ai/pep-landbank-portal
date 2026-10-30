"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Chat (11-chat-plan.md) + full attachments (12-chat-attachments-plan.md)
// + WhatsApp-grade real-time/presence/calls (13-chat-whatsapp-grade-rebuild.md).
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
  replyToId: string | null;
  forwarded: boolean;
  /** Client-only: true while an optimistically-inserted send hasn't been confirmed by the server yet. */
  pending?: boolean;
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
  reply_to_id: string | null;
  forwarded: boolean;
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
    replyToId: r.reply_to_id,
    forwarded: r.forwarded,
  };
}

const messagesKey = (myKey: string | undefined) => ["chat-messages", myKey] as const;

function patchMessages(qc: QueryClient, myKey: string | undefined, patch: (prev: ChatMessage[]) => ChatMessage[]) {
  qc.setQueryData<ChatMessage[]>(messagesKey(myKey), (prev) => patch(prev ?? []));
}

// RLS already restricts every row to {sender_key = me} OR {recipient_key = me} --
// this one query returns every DM the signed-in user is party to, then we
// group it client-side into per-partner threads (the security boundary is
// the RLS policy, this grouping is presentation only).
export function useAllMyMessages(myKey: string | undefined) {
  return useQuery({
    queryKey: messagesKey(myKey),
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
  replyToId?: string | null;
}

// Root cause of "takes a long time to show after you type": every send used
// to call invalidateQueries on the whole cross-thread message list (up to
// 1000 rows), so one message meant a full refetch+reparse before the UI
// moved. A plain-text send now appends straight to the cache -- the sender
// sees it instantly, no round trip -- and every mutation here patches the
// cache directly instead of invalidating it.
export function useSendMessage(myKey: string | undefined, myName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMessageInput) => {
      if (!myKey) throw new Error("Not signed in.");
      const sb = requireSupabase();

      if (input.location) {
        const { data, error } = await sb
          .from("messages")
          .insert({
            sender_key: myKey,
            sender_name: myName,
            recipient_key: input.recipientKey,
            body: input.body,
            read: false,
            kind: "location",
            location_lat: input.location.lat,
            location_lng: input.location.lng,
            location_label: input.location.label,
            reply_to_id: input.replyToId ?? null,
          })
          .select("*")
          .single();
        if (error) throw error;
        return mapMessage(data as RawMessage);
      }

      if (input.attachmentFile) {
        const { path, sizeBytes } = await uploadChatAttachment(myKey, input.recipientKey, input.attachmentFile);
        const { data, error } = await sb
          .from("messages")
          .insert({
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
            reply_to_id: input.replyToId ?? null,
          })
          .select("*")
          .single();
        if (error) throw error;
        return mapMessage(data as RawMessage);
      }

      const { data, error } = await sb
        .from("messages")
        .insert({ sender_key: myKey, sender_name: myName, recipient_key: input.recipientKey, body: input.body, read: false, reply_to_id: input.replyToId ?? null })
        .select("*")
        .single();
      if (error) throw error;
      return mapMessage(data as RawMessage);
    },
    onMutate: async (input) => {
      if (!myKey || input.attachmentFile || input.location) return undefined;
      const tempId = `pending-${crypto.randomUUID()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        senderKey: myKey,
        senderName: myName ?? "",
        recipientKey: input.recipientKey,
        body: input.body,
        createdAt: new Date().toISOString(),
        read: false,
        kind: null,
        attachmentData: null,
        attachmentType: null,
        attachmentName: null,
        attachmentUrl: null,
        attachmentSizeBytes: null,
        attachmentDurationSeconds: null,
        locationLat: null,
        locationLng: null,
        locationLabel: null,
        replyToId: input.replyToId ?? null,
        forwarded: false,
        pending: true,
      };
      patchMessages(qc, myKey, (prev) => [...prev, optimistic]);
      return { tempId };
    },
    onSuccess: (real, _input, ctx) => {
      patchMessages(qc, myKey, (prev) => {
        const withoutTemp = ctx?.tempId ? prev.filter((m) => m.id !== ctx.tempId) : prev;
        if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp;
        return [...withoutTemp, real];
      });
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.tempId) patchMessages(qc, myKey, (prev) => prev.filter((m) => m.id !== ctx.tempId));
    },
  });
}

export function useMarkThreadRead(myKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partnerKey: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("messages").update({ read: true }).eq("sender_key", partnerKey).eq("recipient_key", myKey as string).eq("read", false);
      if (error) throw error;
      return partnerKey;
    },
    onSuccess: (partnerKey) => {
      patchMessages(qc, myKey, (prev) => prev.map((m) => (m.senderKey === partnerKey && m.recipientKey === myKey ? { ...m, read: true } : m)));
    },
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
      return message.id;
    },
    onSuccess: (id) => {
      patchMessages(qc, myKey, (prev) => prev.filter((m) => m.id !== id));
    },
  });
}

// Real Supabase Realtime subscription, matching V1's own subscribeToChat.
// Root cause of "doesn't sync in real time" was twofold: no reconnect/
// backoff on a dropped socket (console showed the join itself failing),
// and every event invalidated the whole 1000-row query instead of patching
// it -- mirrors the exact capped-backoff pattern already proven for
// Attendance/Leave's own realtime bridge (src/openhr/services/realtime.ts).
const REALTIME_BACKOFF_CAP_MS = 15000;

export function useChatRealtime(myKey: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!myKey) return;
    const sb = requireSupabase();
    let attempt = 0;
    let channel: ReturnType<typeof sb.channel> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;
      if (channel) sb.removeChannel(channel);
      attempt += 1;
      const ch = sb
        .channel(`chat-messages-${myKey}-${attempt}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const incoming = mapMessage(payload.new as RawMessage);
              patchMessages(qc, myKey, (prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
            } else if (payload.eventType === "UPDATE") {
              const updated = mapMessage(payload.new as RawMessage);
              patchMessages(qc, myKey, (prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            } else if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string })?.id;
              if (oldId) patchMessages(qc, myKey, (prev) => prev.filter((m) => m.id !== oldId));
            }
          },
        )
        // Full test sweep, Batch 5 (docs/plans/38-cross-app-sync-findings-batch5.md):
        // chat_message_reactions/chat_group_members/chat_groups were all in
        // the supabase_realtime publication but subscribed nowhere -- a
        // reaction someone else added, or being added/removed from a group,
        // never reached an already-open Chat screen without a manual
        // refresh. Prefix-invalidate (TanStack Query's invalidateQueries
        // matches by key prefix) rather than patch in place, since these
        // are low-frequency, low-volume changes unlike the message stream.
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reactions" }, () => {
          qc.invalidateQueries({ queryKey: ["chat-reactions"] });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_members" }, () => {
          qc.invalidateQueries({ queryKey: ["chat-my-groups"] });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_groups" }, () => {
          qc.invalidateQueries({ queryKey: ["chat-my-groups"] });
        });
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          attempt = 0;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          const delay = Math.min(2000 * Math.max(attempt, 1), REALTIME_BACKOFF_CAP_MS);
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, delay);
        }
      });
      channel = ch;
    }

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) sb.removeChannel(channel);
    };
  }, [myKey, qc]);
}

// Real Supabase Broadcast typing indicator -- ephemeral, never written to
// the database. Each side broadcasts on a channel keyed by the sorted pair
// of participant keys, so both parties land on the exact same channel name
// regardless of who's "me" in each session.
function typingChannelName(a: string, b: string): string {
  return `chat-typing-${[a, b].sort().join("-")}`;
}

export function useTypingBroadcast(myKey: string | undefined, partnerKey: string | undefined) {
  const channelRef = useRef<ReturnType<ReturnType<typeof requireSupabase>["channel"]> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!myKey || !partnerKey) return;
    const sb = requireSupabase();
    const ch = sb.channel(typingChannelName(myKey, partnerKey));
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      sb.removeChannel(ch);
      channelRef.current = null;
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, [myKey, partnerKey]);

  function notifyTyping() {
    if (!myKey || !channelRef.current) return;
    channelRef.current.send({ type: "broadcast", event: "typing", payload: { senderKey: myKey } });
  }

  return { notifyTyping };
}

export function useTypingStatus(myKey: string | undefined, partnerKey: string | undefined) {
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsPartnerTyping(false);
    if (!myKey || !partnerKey) return;
    const sb = requireSupabase();
    const ch = sb.channel(typingChannelName(myKey, partnerKey));
    ch.on("broadcast", { event: "typing" }, (payload) => {
      const senderKey = (payload.payload as { senderKey?: string })?.senderKey;
      if (senderKey !== partnerKey) return;
      setIsPartnerTyping(true);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => setIsPartnerTyping(false), 3000);
    });
    ch.subscribe();
    return () => {
      sb.removeChannel(ch);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, [myKey, partnerKey]);

  return isPartnerTyping;
}

export { previewText };
