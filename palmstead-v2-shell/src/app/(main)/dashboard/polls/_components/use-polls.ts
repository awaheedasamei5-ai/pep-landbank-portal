"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Polls (OSS item 2, B.4). Schema field-for-field from the real
// source repo's migration 023. Creation gated through the real existing
// permission system (has_permission('polls.create')), not a new ad-hoc
// flag -- see docs/plans/02-general-staff-portal-plan.md.
export interface Poll {
  id: string;
  question: string;
  options: string[];
  createdBy: string;
  deadline: string | null;
  isArchived: boolean;
  createdAt: string;
  voteCounts: number[];
  totalVotes: number;
  myVoteIndex: number | null;
}

async function fetchPolls(staffKey: string | undefined): Promise<Poll[]> {
  const sb = requireSupabase();
  const [pollsRes, votesRes] = await Promise.all([
    sb.from("polls").select("id,question,options,created_by,deadline,is_archived,created_at").order("created_at", { ascending: false }),
    sb.from("poll_votes").select("poll_id,staff_key,option_index"),
  ]);
  if (pollsRes.error) throw pollsRes.error;
  if (votesRes.error) throw votesRes.error;

  const votes = (votesRes.data ?? []) as { poll_id: string; staff_key: string; option_index: number }[];

  type Raw = { id: string; question: string; options: unknown; created_by: string; deadline: string | null; is_archived: boolean; created_at: string };
  return ((pollsRes.data ?? []) as Raw[]).map((p) => {
    const options = (p.options as string[]) ?? [];
    const pollVotes = votes.filter((v) => v.poll_id === p.id);
    const voteCounts = options.map((_, i) => pollVotes.filter((v) => v.option_index === i).length);
    const mine = pollVotes.find((v) => v.staff_key === staffKey);
    return {
      id: p.id,
      question: p.question,
      options,
      createdBy: p.created_by,
      deadline: p.deadline,
      isArchived: p.is_archived,
      createdAt: p.created_at,
      voteCounts,
      totalVotes: pollVotes.length,
      myVoteIndex: mine ? mine.option_index : null,
    };
  });
}

export function usePolls(staffKey: string | undefined) {
  return useQuery({ queryKey: ["polls", staffKey], queryFn: () => fetchPolls(staffKey) });
}

export function useCreatePoll(createdBy: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { question: string; options: string[]; deadline: string | null }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("polls").insert({ question: data.question, options: data.options, deadline: data.deadline, created_by: createdBy });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });
}

export function useVotePoll(staffKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pollId, optionIndex }: { pollId: string; optionIndex: number }) => {
      const sb = requireSupabase();
      const { error } = await sb.from("poll_votes").upsert({ poll_id: pollId, staff_key: staffKey, option_index: optionIndex }, { onConflict: "poll_id,staff_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });
}

export function useRemoveVote(staffKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pollId: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("poll_votes").delete().eq("poll_id", pollId).eq("staff_key", staffKey);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });
}

export function useArchivePoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pollId: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("polls").update({ is_archived: true }).eq("id", pollId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });
}
