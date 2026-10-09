"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Team Feedback (OSS item 2, B.6 gap-check): confirmed before
// building anything that feedback/feedback_comments already existed as
// a real dormant schema replica of V1's own table (identical shape),
// unwired to any frontend -- same pattern as B.2 Announcements. Ports
// V1's real logic (apiInsertFeedback, FEEDBACK_CATEGORIES, the real
// feedback_comments thread), not the source repo's separate `feedback`
// table (migration 001), per the blueprint's own "don't build a
// duplicate feedback mechanism" instruction.
export const FEEDBACK_CATEGORIES = ["Bug", "Suggestion", "Feature Request", "Other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export interface FeedbackItem {
  id: string;
  authorKey: string;
  authorName: string;
  body: string;
  category: string;
  createdAt: string;
  commentCount: number;
}

export interface FeedbackComment {
  id: string;
  authorKey: string;
  authorName: string;
  body: string;
  createdAt: string;
}

async function fetchFeedback(): Promise<FeedbackItem[]> {
  const sb = requireSupabase();
  const [feedbackRes, commentsRes] = await Promise.all([
    sb.from("feedback").select("id,author_key,author_name,body,category,created_at").order("created_at", { ascending: false }),
    sb.from("feedback_comments").select("feedback_id"),
  ]);
  if (feedbackRes.error) throw feedbackRes.error;
  if (commentsRes.error) throw commentsRes.error;

  const countByFeedback = new Map<string, number>();
  for (const c of (commentsRes.data ?? []) as { feedback_id: string }[]) {
    countByFeedback.set(c.feedback_id, (countByFeedback.get(c.feedback_id) ?? 0) + 1);
  }

  return (feedbackRes.data ?? []).map((f) => ({
    id: f.id,
    authorKey: f.author_key,
    authorName: f.author_name,
    body: f.body,
    category: f.category,
    createdAt: f.created_at,
    commentCount: countByFeedback.get(f.id) ?? 0,
  }));
}

export function useTeamFeedback() {
  return useQuery({ queryKey: ["teamFeedback"], queryFn: fetchFeedback });
}

export function useCreateFeedback(authorKey: string | undefined, authorName: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { body: string; category: FeedbackCategory }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("feedback").insert({ body: data.body, category: data.category, author_key: authorKey, author_name: authorName });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teamFeedback"] }),
  });
}

async function fetchComments(feedbackId: string): Promise<FeedbackComment[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("feedback_comments").select("id,author_key,author_name,body,created_at").eq("feedback_id", feedbackId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, authorKey: c.author_key, authorName: c.author_name, body: c.body, createdAt: c.created_at }));
}

export function useFeedbackComments(feedbackId: string | null) {
  return useQuery({ queryKey: ["feedbackComments", feedbackId], queryFn: () => fetchComments(feedbackId as string), enabled: Boolean(feedbackId) });
}

export function usePostFeedbackComment(feedbackId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, authorKey, authorName }: { body: string; authorKey: string; authorName: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("feedback_comments").insert({ feedback_id: feedbackId, author_key: authorKey, author_name: authorName, body });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedbackComments", feedbackId] });
      qc.invalidateQueries({ queryKey: ["teamFeedback"] });
    },
  });
}
