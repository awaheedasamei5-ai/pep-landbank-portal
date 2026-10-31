"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

export function useNotesAccess(staffKey: string | undefined) {
  return useQuery({
    queryKey: ["notesAccess", staffKey],
    enabled: Boolean(staffKey),
    refetchInterval: 15_000,
    queryFn: async () => {
      const client = requireSupabase();
      const [view, manage] = await Promise.all([
        client.rpc("has_permission", { p_key: "notes.view" }),
        client.rpc("has_permission", { p_key: "notes.manage" }),
      ]);
      if (view.error || manage.error) throw new Error("Notes access could not be checked.");
      return { view: view.data === true, manage: manage.data === true };
    },
  });
}

