"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

// Real Notes (10-notes-plan.md). The notes table + RLS already existed live
// in sbydzrlzqxcdbudjaube before this app was built -- UI-side work only,
// no schema change. body stores TipTap HTML (same plain `text` column V1
// used for its own plain-text body -- no migration needed, 0 existing rows).
export interface Note {
  id: string;
  ownerKey: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

type RawNote = {
  id: string;
  owner_key: string;
  title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

function mapNote(r: RawNote): Note {
  return {
    id: r.id,
    ownerKey: r.owner_key,
    title: r.title ?? "",
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function useNotes(myKey: string | undefined) {
  return useQuery({
    queryKey: ["notes", myKey],
    enabled: Boolean(myKey),
    queryFn: async (): Promise<Note[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("notes").select("*").eq("owner_key", myKey as string).order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapNote);
    },
  });
}

export function useSaveNote(myKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; title: string; body: string }): Promise<Note> => {
      const sb = requireSupabase();
      if (input.id) {
        const { data, error } = await sb
          .from("notes")
          .update({ title: input.title, body: input.body, updated_at: new Date().toISOString() })
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw error;
        return mapNote(data as RawNote);
      }
      const { data, error } = await sb
        .from("notes")
        .insert({ owner_key: myKey, title: input.title, body: input.body })
        .select("*")
        .single();
      if (error) throw error;
      return mapNote(data as RawNote);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", myKey] }),
  });
}

export function useDeleteNote(myKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sb = requireSupabase();
      const { error } = await sb.from("notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", myKey] }),
  });
}
