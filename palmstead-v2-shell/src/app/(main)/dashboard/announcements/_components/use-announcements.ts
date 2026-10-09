"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isoDateOnly } from "@/lib/palmstead/format";
import { requireSupabase } from "@/lib/supabase.client";

// Real Announcements (OSS item 2, B.2). V1 logic is the primary spec here
// (the one module where it is, per the blueprint) -- preserved: per-user
// dismiss (now server-side via announcement_reads, replacing V1's
// localStorage-only pep_dismissed_announce, which never synced across
// devices), Management-only authoring, a bell/badge unread count. Added
// from the real OSS repo (lib/announcement-categories.ts, fetched and
// confirmed, not invented): a real category field and a real archive/
// browse view, since V1 only ever surfaced a dismiss-once bubble with no
// way to look back at past announcements.
export const ANNOUNCEMENT_CATEGORIES = [
  { value: "general", label: "General Notice" },
  { value: "ooo", label: "Out of Office" },
  { value: "event", label: "Event / Meeting" },
  { value: "closure", label: "Office Closure" },
  { value: "celebrate", label: "Celebration" },
  { value: "newjoiner", label: "New Joiner" },
  { value: "policy", label: "Policy Update" },
  { value: "urgent", label: "Urgent Notice" },
  { value: "meeting", label: "Going to Meeting" },
  { value: "it", label: "IT / Systems" },
] as const;

export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number]["value"];

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  imageB64: string | null;
  active: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  isRead: boolean;
  readCount: number;
  commentCount: number;
}

export interface AnnouncementComment {
  id: string;
  authorKey: string;
  authorName: string;
  body: string;
  createdAt: string;
}

async function fetchAnnouncements(staffKey: string | undefined): Promise<Announcement[]> {
  const sb = requireSupabase();
  const todayIso = isoDateOnly(new Date());
  const [annRes, readsRes, commentsRes] = await Promise.all([
    sb.from("announcements").select("id,title,body,category,image_b64,active,created_by,created_at,expires_at").eq("active", true).order("created_at", { ascending: false }),
    sb.from("announcement_reads").select("announcement_id,staff_key"),
    sb.from("announcement_comments").select("announcement_id"),
  ]);
  if (annRes.error) throw annRes.error;
  if (readsRes.error) throw readsRes.error;
  if (commentsRes.error) throw commentsRes.error;

  const reads = (readsRes.data ?? []) as { announcement_id: string; staff_key: string }[];
  const comments = (commentsRes.data ?? []) as { announcement_id: string }[];
  const readCountByAnn = new Map<string, number>();
  const myReads = new Set<string>();
  for (const r of reads) {
    readCountByAnn.set(r.announcement_id, (readCountByAnn.get(r.announcement_id) ?? 0) + 1);
    if (r.staff_key === staffKey) myReads.add(r.announcement_id);
  }
  const commentCountByAnn = new Map<string, number>();
  for (const c of comments) commentCountByAnn.set(c.announcement_id, (commentCountByAnn.get(c.announcement_id) ?? 0) + 1);

  type Raw = {
    id: string;
    title: string;
    body: string;
    category: string;
    image_b64: string | null;
    active: boolean;
    created_by: string;
    created_at: string;
    expires_at: string | null;
  };
  return ((annRes.data ?? []) as Raw[])
    .filter((a) => !a.expires_at || a.expires_at.slice(0, 10) >= todayIso)
    .map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      category: a.category,
      imageB64: a.image_b64,
      active: a.active,
      createdBy: a.created_by,
      createdAt: a.created_at,
      expiresAt: a.expires_at,
      isRead: myReads.has(a.id),
      readCount: readCountByAnn.get(a.id) ?? 0,
      commentCount: commentCountByAnn.get(a.id) ?? 0,
    }));
}

export function useAnnouncements(staffKey: string | undefined) {
  return useQuery({ queryKey: ["announcements", staffKey], queryFn: () => fetchAnnouncements(staffKey), enabled: Boolean(staffKey) });
}

export function useMarkAnnouncementRead(staffKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (announcementId: string) => {
      if (!staffKey) return;
      const sb = requireSupabase();
      const { error } = await sb.from("announcement_reads").upsert({ announcement_id: announcementId, staff_key: staffKey }, { onConflict: "announcement_id,staff_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements", staffKey] }),
  });
}

export function useCreateAnnouncement(staffKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; body: string; category: AnnouncementCategory; expiresAt: string | null }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("announcements").insert({
        title: data.title,
        body: data.body,
        category: data.category,
        expires_at: data.expiresAt,
        active: true,
        created_by: staffKey,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useRetractAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("announcements").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

async function fetchComments(announcementId: string): Promise<AnnouncementComment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("announcement_comments").select("id,author_key,author_name,body,created_at").eq("announcement_id", announcementId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, authorKey: c.author_key, authorName: c.author_name, body: c.body, createdAt: c.created_at }));
}

export function useAnnouncementComments(announcementId: string | null) {
  return useQuery({ queryKey: ["announcementComments", announcementId], queryFn: () => fetchComments(announcementId as string), enabled: Boolean(announcementId) });
}

export function usePostComment(announcementId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, authorKey, authorName }: { body: string; authorKey: string; authorName: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("announcement_comments").insert({ announcement_id: announcementId, author_key: authorKey, author_name: authorName, body });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcementComments", announcementId] }),
  });
}
