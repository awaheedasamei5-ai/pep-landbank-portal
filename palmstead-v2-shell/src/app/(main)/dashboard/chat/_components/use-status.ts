"use client";

import { useMemo } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real WhatsApp-style Status updates (13-chat-whatsapp-grade-rebuild.md):
// text or photo, visible company-wide for 24h, real per-viewer tracking.
// RLS already scopes `select` to expires_at > now() -- expired rows simply
// stop coming back, no client-side filtering needed for visibility, only
// for grouping.
export interface StatusUpdate {
  id: string;
  authorKey: string;
  authorName: string;
  kind: "text" | "image";
  body: string;
  imageUrl: string | null;
  background: string | null;
  createdAt: string;
  expiresAt: string;
}

type RawStatus = {
  id: string;
  author_key: string;
  author_name: string;
  kind: string;
  body: string;
  image_url: string | null;
  background: string | null;
  created_at: string;
  expires_at: string;
};

function mapStatus(r: RawStatus): StatusUpdate {
  return {
    id: r.id,
    authorKey: r.author_key,
    authorName: r.author_name,
    kind: r.kind === "image" ? "image" : "text",
    body: r.body,
    imageUrl: r.image_url,
    background: r.background,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
}

export function useStatusFeed() {
  return useQuery({
    queryKey: ["chat-status-feed"],
    queryFn: async (): Promise<StatusUpdate[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("chat_status_updates").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapStatus);
    },
    refetchInterval: 60_000,
  });
}

export interface StatusGroup {
  authorKey: string;
  authorName: string;
  updates: StatusUpdate[];
  latest: StatusUpdate;
}

export function useStatusGroups(myKey: string | undefined) {
  const { data: updates, isLoading } = useStatusFeed();
  const groups = useMemo((): StatusGroup[] => {
    if (!updates) return [];
    const byAuthor = new Map<string, StatusUpdate[]>();
    for (const u of updates) {
      const list = byAuthor.get(u.authorKey) ?? [];
      list.push(u);
      byAuthor.set(u.authorKey, list);
    }
    const result: StatusGroup[] = [];
    for (const [authorKey, list] of byAuthor) {
      const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      result.push({ authorKey, authorName: sorted[0].authorName, updates: sorted, latest: sorted[sorted.length - 1] });
    }
    // My own status (if any) first, then everyone else by most recent.
    return result.sort((a, b) => {
      if (a.authorKey === myKey) return -1;
      if (b.authorKey === myKey) return 1;
      return b.latest.createdAt.localeCompare(a.latest.createdAt);
    });
  }, [updates, myKey]);
  return { groups, isLoading };
}

export function useStatusViewers(statusId: string | null) {
  return useQuery({
    queryKey: ["chat-status-viewers", statusId],
    enabled: Boolean(statusId),
    queryFn: async (): Promise<{ viewerKey: string; viewerName: string; viewedAt: string }[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("chat_status_views").select("viewer_key,viewer_name,viewed_at").eq("status_id", statusId as string);
      if (error) throw error;
      return (data ?? []).map((v) => ({ viewerKey: v.viewer_key, viewerName: v.viewer_name, viewedAt: v.viewed_at }));
    },
  });
}

export function useMyStatusViews(myKey: string | undefined) {
  return useQuery({
    queryKey: ["chat-status-my-views", myKey],
    enabled: Boolean(myKey),
    queryFn: async (): Promise<Set<string>> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("chat_status_views").select("status_id").eq("viewer_key", myKey as string);
      if (error) throw error;
      return new Set((data ?? []).map((v) => v.status_id));
    },
  });
}

export function useMarkStatusViewed(myKey: string | undefined, myName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (statusId: string) => {
      if (!myKey) return;
      const sb = requireSupabase();
      const { error } = await sb.from("chat_status_views").upsert({ status_id: statusId, viewer_key: myKey, viewer_name: myName ?? "" }, { onConflict: "status_id,viewer_key" });
      if (error) throw error;
    },
    onSuccess: (_void, statusId) => {
      qc.setQueryData<Set<string>>(["chat-status-my-views", myKey], (prev) => new Set([...(prev ?? []), statusId]));
      qc.invalidateQueries({ queryKey: ["chat-status-viewers", statusId] });
    },
  });
}

async function uploadStatusImage(myKey: string, file: File): Promise<string> {
  const sb = requireSupabase();
  const path = `${myKey}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await sb.storage.from("status-updates").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export function usePostStatus(myKey: string | undefined, myName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; imageFile?: File; background?: string }) => {
      if (!myKey) throw new Error("Not signed in.");
      const sb = requireSupabase();
      let imageUrl: string | null = null;
      if (input.imageFile) imageUrl = await uploadStatusImage(myKey, input.imageFile);
      const { error } = await sb.from("chat_status_updates").insert({
        author_key: myKey,
        author_name: myName,
        kind: imageUrl ? "image" : "text",
        body: input.body,
        image_url: imageUrl,
        background: input.background ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-status-feed"] }),
  });
}

export function useDeleteStatus(myKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: Pick<StatusUpdate, "id" | "imageUrl">) => {
      const sb = requireSupabase();
      const { error } = await sb.from("chat_status_updates").delete().eq("id", status.id);
      if (error) throw error;
      if (status.imageUrl) await sb.storage.from("status-updates").remove([status.imageUrl]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-status-feed"] }),
  });
}

export function useStatusImageUrl(path: string | null) {
  return useQuery({
    queryKey: ["chat-status-image-url", path],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<string> => {
      const sb = requireSupabase();
      const { data, error } = await sb.storage.from("status-updates").createSignedUrl(path as string, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
