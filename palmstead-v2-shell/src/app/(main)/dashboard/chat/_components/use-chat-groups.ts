"use client";

import { useMemo } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

import { previewText, type ChatMessage } from "./use-chat";

// Real WhatsApp-style group chats (15-chat-whatsapp-full-replica.md).
// A message belongs to exactly one of recipient_key (1:1, existing) or
// group_id (new) -- the messages table, attachment columns, reactions, and
// realtime wiring are all shared with 1:1 chat, not a parallel pipeline.
export interface ChatGroupMember {
  staffKey: string;
  staffName: string;
  role: "admin" | "member";
}

export interface ChatGroup {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  createdBy: string;
  onlyAdminsCanSend: boolean;
  onlyAdminsCanEditInfo: boolean;
  members: ChatGroupMember[];
}

export interface GroupThread {
  group: ChatGroup;
  messages: ChatMessage[];
  lastMessage: ChatMessage | undefined;
}

function mapMessageRow(r: Record<string, unknown>): ChatMessage {
  const ATTACHMENT_KINDS = new Set(["image", "video", "audio", "file", "location"]);
  const kind = r.kind as string | null;
  return {
    id: r.id as string,
    senderKey: r.sender_key as string,
    senderName: r.sender_name as string,
    recipientKey: r.recipient_key as string | null,
    body: r.body as string,
    createdAt: r.created_at as string,
    read: r.read as boolean,
    kind: kind && ATTACHMENT_KINDS.has(kind) ? (kind as ChatMessage["kind"]) : null,
    attachmentData: r.attachment_data as string | null,
    attachmentType: r.attachment_type as string | null,
    attachmentName: r.attachment_name as string | null,
    attachmentUrl: r.attachment_url as string | null,
    attachmentSizeBytes: r.attachment_size_bytes as number | null,
    attachmentDurationSeconds: r.attachment_duration_seconds as number | null,
    locationLat: r.location_lat as number | null,
    locationLng: r.location_lng as number | null,
    locationLabel: r.location_label as string | null,
    replyToId: r.reply_to_id as string | null,
    forwarded: Boolean(r.forwarded),
  };
}

export function useMyGroups(myKey: string | undefined) {
  return useQuery({
    queryKey: ["chat-my-groups", myKey],
    enabled: Boolean(myKey),
    queryFn: async (): Promise<ChatGroup[]> => {
      const sb = requireSupabase();
      const { data: memberships, error: mErr } = await sb.from("chat_group_members").select("group_id").eq("staff_key", myKey as string);
      if (mErr) throw mErr;
      const groupIds = (memberships ?? []).map((m) => m.group_id as string);
      if (groupIds.length === 0) return [];

      const [{ data: groups, error: gErr }, { data: allMembers, error: amErr }] = await Promise.all([
        sb.from("chat_groups").select("*").in("id", groupIds),
        sb.from("chat_group_members").select("*").in("group_id", groupIds),
      ]);
      if (gErr) throw gErr;
      if (amErr) throw amErr;

      return (groups ?? []).map((g) => ({
        id: g.id as string,
        name: g.name as string,
        description: g.description as string,
        avatarUrl: g.avatar_url as string | null,
        createdBy: g.created_by as string,
        onlyAdminsCanSend: g.only_admins_can_send as boolean,
        onlyAdminsCanEditInfo: g.only_admins_can_edit_info as boolean,
        members: (allMembers ?? [])
          .filter((m) => m.group_id === g.id)
          .map((m) => ({ staffKey: m.staff_key as string, staffName: m.staff_name as string, role: m.role as "admin" | "member" })),
      }));
    },
  });
}

export function useGroupMessages(groupId: string | null) {
  return useQuery({
    queryKey: ["chat-group-messages", groupId],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<ChatMessage[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("messages").select("*").eq("group_id", groupId as string).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapMessageRow);
    },
  });
}

export function useGroupThreads(myKey: string | undefined): { groupThreads: GroupThread[]; isLoading: boolean } {
  const { data: groups, isLoading } = useMyGroups(myKey);
  const groupIds = useMemo(() => (groups ?? []).map((g) => g.id), [groups]);

  const messagesQuery = useQuery({
    queryKey: ["chat-all-group-messages", groupIds.join(",")],
    enabled: groupIds.length > 0,
    queryFn: async (): Promise<Map<string, ChatMessage[]>> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("messages").select("*").in("group_id", groupIds).order("created_at", { ascending: true });
      if (error) throw error;
      const byGroup = new Map<string, ChatMessage[]>();
      for (const row of data ?? []) {
        const gid = row.group_id as string;
        const list = byGroup.get(gid) ?? [];
        list.push(mapMessageRow(row));
        byGroup.set(gid, list);
      }
      return byGroup;
    },
  });

  const groupThreads = useMemo((): GroupThread[] => {
    if (!groups) return [];
    return groups.map((group) => {
      const messages = messagesQuery.data?.get(group.id) ?? [];
      return { group, messages, lastMessage: messages[messages.length - 1] };
    });
  }, [groups, messagesQuery.data]);

  return { groupThreads, isLoading };
}

export function useCreateGroup(myKey: string | undefined, myName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; memberKeys: { key: string; name: string }[] }) => {
      if (!myKey) throw new Error("Not signed in.");
      const sb = requireSupabase();
      const { data: group, error } = await sb.from("chat_groups").insert({ name: input.name, created_by: myKey }).select("*").single();
      if (error) throw error;
      // Two separate inserts, not one batch: the member-insert policy checks
      // "is the inserter already an admin of this group", and within a
      // single multi-row INSERT statement no row is visible to another
      // row's RLS check yet -- the creator's own admin row has to actually
      // commit first before they're allowed to add anyone else.
      const { error: selfErr } = await sb.from("chat_group_members").insert({ group_id: group.id, staff_key: myKey, staff_name: myName ?? "", role: "admin" });
      if (selfErr) throw selfErr;
      if (input.memberKeys.length > 0) {
        const { error: memErr } = await sb
          .from("chat_group_members")
          .insert(input.memberKeys.map((m) => ({ group_id: group.id, staff_key: m.key, staff_name: m.name, role: "member" as const })));
        if (memErr) throw memErr;
      }
      return group.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-my-groups", myKey] }),
  });
}

// Group attachments share the chat-attachments Storage bucket with 1:1
// chat -- a distinct path prefix ("group/...") keeps the two RLS policy
// sets mutually exclusive (see the chat_attachments_group_storage_* migration).
function groupAttachmentPath(groupId: string, myKey: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `group/${groupId}/${myKey}/${crypto.randomUUID()}-${safeName}`;
}

function attachmentKindFromMime(mime: string): "image" | "video" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

interface SendGroupMessageInput {
  groupId: string;
  body: string;
  replyToId?: string | null;
  attachmentFile?: File;
  attachmentDurationSeconds?: number;
  location?: { lat: number; lng: number; label: string | null };
}

export function useSendGroupMessage(myKey: string | undefined, myName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendGroupMessageInput) => {
      if (!myKey) throw new Error("Not signed in.");
      const sb = requireSupabase();

      if (input.location) {
        const { error } = await sb.from("messages").insert({
          sender_key: myKey,
          sender_name: myName,
          group_id: input.groupId,
          body: input.body,
          read: true,
          reply_to_id: input.replyToId ?? null,
          kind: "location",
          location_lat: input.location.lat,
          location_lng: input.location.lng,
          location_label: input.location.label,
        });
        if (error) throw error;
        return;
      }

      if (input.attachmentFile) {
        const path = groupAttachmentPath(input.groupId, myKey, input.attachmentFile.name);
        const { error: upErr } = await sb.storage.from("chat-attachments").upload(path, input.attachmentFile, { contentType: input.attachmentFile.type || undefined });
        if (upErr) throw upErr;
        const { error } = await sb.from("messages").insert({
          sender_key: myKey,
          sender_name: myName,
          group_id: input.groupId,
          body: input.body,
          read: true,
          reply_to_id: input.replyToId ?? null,
          kind: attachmentKindFromMime(input.attachmentFile.type),
          attachment_url: path,
          attachment_name: input.attachmentFile.name,
          attachment_type: input.attachmentFile.type || null,
          attachment_size_bytes: input.attachmentFile.size,
          attachment_duration_seconds: input.attachmentDurationSeconds ?? null,
        });
        if (error) throw error;
        return;
      }

      const { error } = await sb
        .from("messages")
        .insert({ sender_key: myKey, sender_name: myName, group_id: input.groupId, body: input.body, read: true, reply_to_id: input.replyToId ?? null });
      if (error) throw error;
    },
    onSuccess: (_void, input) => {
      qc.invalidateQueries({ queryKey: ["chat-group-messages", input.groupId] });
      qc.invalidateQueries({ queryKey: ["chat-all-group-messages"] });
    },
  });
}

export function useAddGroupMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (member: { key: string; name: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("chat_group_members").insert({ group_id: groupId, staff_key: member.key, staff_name: member.name, role: "member" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-my-groups"] }),
  });
}

export function useRemoveGroupMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (staffKey: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("chat_group_members").delete().eq("group_id", groupId).eq("staff_key", staffKey);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-my-groups"] }),
  });
}

export function useSetGroupMemberRole(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { staffKey: string; role: "admin" | "member" }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("chat_group_members").update({ role: input.role }).eq("group_id", groupId).eq("staff_key", input.staffKey);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-my-groups"] }),
  });
}

export function useUpdateGroupSettings(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<{ name: string; description: string; onlyAdminsCanSend: boolean; onlyAdminsCanEditInfo: boolean }>) => {
      const sb = requireSupabase();
      const { error } = await sb
        .from("chat_groups")
        .update({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.onlyAdminsCanSend !== undefined ? { only_admins_can_send: input.onlyAdminsCanSend } : {}),
          ...(input.onlyAdminsCanEditInfo !== undefined ? { only_admins_can_edit_info: input.onlyAdminsCanEditInfo } : {}),
        })
        .eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-my-groups"] }),
  });
}

export function groupPreviewText(m: ChatMessage | undefined): string {
  return m ? previewText(m) : "No messages yet";
}
