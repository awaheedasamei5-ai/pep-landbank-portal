"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isoDateOnly } from "@/lib/palmstead/format";
import { requireSupabase } from "@/lib/supabase.client";

// Real Notice Board (OSS item 2, B.3). Schema field-for-field from the
// real source repo's own migration 023. Moderation deliberately deviates
// from the repo's open-delete-by-anyone model: the user decided
// (2026-10-09) that removing someone else's post files a report to
// Management instead of deleting it outright -- see
// docs/plans/02-general-staff-portal-plan.md.
export const NOTICE_COLOURS = ["amber", "emerald", "sky", "rose", "violet", "slate"] as const;
export type NoticeColour = (typeof NOTICE_COLOURS)[number];

export interface NoticePost {
  id: string;
  content: string;
  linkUrl: string | null;
  linkLabel: string | null;
  colour: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  reportCount: number;
}

async function fetchPosts(): Promise<NoticePost[]> {
  const sb = requireSupabase();
  const todayIso = isoDateOnly(new Date());
  const [postsRes, reportsRes] = await Promise.all([
    sb.from("notice_board_posts").select("id,content,link_url,link_label,colour,created_by,created_at,expires_at").order("created_at", { ascending: false }),
    sb.from("notice_board_reports").select("post_id"),
  ]);
  if (postsRes.error) throw postsRes.error;
  if (reportsRes.error) throw reportsRes.error;

  const reportCountByPost = new Map<string, number>();
  for (const r of (reportsRes.data ?? []) as { post_id: string }[]) {
    reportCountByPost.set(r.post_id, (reportCountByPost.get(r.post_id) ?? 0) + 1);
  }

  type Raw = { id: string; content: string; link_url: string | null; link_label: string | null; colour: string; created_by: string; created_at: string; expires_at: string | null };
  return ((postsRes.data ?? []) as Raw[])
    .filter((p) => !p.expires_at || p.expires_at.slice(0, 10) >= todayIso)
    .map((p) => ({
      id: p.id,
      content: p.content,
      linkUrl: p.link_url,
      linkLabel: p.link_label,
      colour: p.colour,
      createdBy: p.created_by,
      createdAt: p.created_at,
      expiresAt: p.expires_at,
      reportCount: reportCountByPost.get(p.id) ?? 0,
    }));
}

export function useNoticeBoard() {
  return useQuery({ queryKey: ["noticeBoard"], queryFn: fetchPosts });
}

export function useCreateNoticePost(createdBy: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { content: string; linkUrl: string | null; linkLabel: string | null; colour: NoticeColour }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("notice_board_posts").insert({
        content: data.content,
        link_url: data.linkUrl,
        link_label: data.linkLabel,
        colour: data.colour,
        created_by: createdBy,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["noticeBoard"] }),
  });
}

export function useDeleteNoticePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("notice_board_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["noticeBoard"] }),
  });
}

export function useReportNoticePost(reportedBy: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, reason }: { postId: string; reason: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("notice_board_reports").insert({ post_id: postId, reported_by: reportedBy, reason: reason || null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["noticeBoard"] }),
  });
}
