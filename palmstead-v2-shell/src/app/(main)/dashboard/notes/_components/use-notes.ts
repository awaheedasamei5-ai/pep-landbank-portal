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
  // docs/plans/41-complete-system-findings-and-phased-fix-plan.md Phase 4
  // (C2.9) -- real lead_id FK added to the notes table in Phase 3. This
  // file is the ACTUAL implementation the Notes app uses (not
  // src/webnext/data/source.ts's own `notes` block, which a prior pass
  // updated but which nothing here ever calls) -- found and fixed as the
  // real root cause, not papered over.
  leadId: string | null;
  createdAt: string;
  updatedAt: string;
}

type RawNote = {
  id: string;
  owner_key: string;
  title: string | null;
  body: string;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapNote(r: RawNote): Note {
  return {
    id: r.id,
    ownerKey: r.owner_key,
    title: r.title ?? "",
    body: r.body,
    leadId: r.lead_id,
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
    mutationFn: async (input: { id?: string; title: string; body: string; leadId?: string | null }): Promise<Note> => {
      const sb = requireSupabase();
      if (input.id) {
        const patch: Record<string, unknown> = { title: input.title, body: input.body, updated_at: new Date().toISOString() };
        if (input.leadId !== undefined) patch.lead_id = input.leadId;
        const { data, error } = await sb.from("notes").update(patch).eq("id", input.id).select("*").single();
        if (error) throw error;
        return mapNote(data as RawNote);
      }
      const { data, error } = await sb
        .from("notes")
        .insert({ owner_key: myKey, title: input.title, body: input.body, lead_id: input.leadId ?? null })
        .select("*")
        .single();
      if (error) throw error;
      return mapNote(data as RawNote);
    },
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ["notes", myKey] });
      if (note.leadId) qc.invalidateQueries({ queryKey: ["notesForLead", note.leadId] });
    },
  });
}

// docs/plans/41-complete-system-findings-and-phased-fix-plan.md Phase 4
// (C2.9) -- the lead detail page's own new Notes section.
export function useNotesForLead(leadId: string | undefined) {
  return useQuery({
    queryKey: ["notesForLead", leadId],
    enabled: Boolean(leadId),
    queryFn: async (): Promise<Note[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.from("notes").select("*").eq("lead_id", leadId as string).order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapNote);
    },
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
