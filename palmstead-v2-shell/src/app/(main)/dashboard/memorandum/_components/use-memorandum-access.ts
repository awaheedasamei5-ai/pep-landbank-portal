"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

export function useMemorandumAccess(staffKey: string | undefined) {
  return useQuery({
    queryKey: ["memorandumAccess", staffKey],
    enabled: Boolean(staffKey),
    refetchInterval: 15_000,
    queryFn: async () => {
      const client = requireSupabase();
      const [view, manage] = await Promise.all([
        client.rpc("has_permission", { p_key: "memorandum.view" }),
        client.rpc("has_permission", { p_key: "memorandum.manage" }),
      ]);
      if (view.error || manage.error) throw new Error("Memorandum access could not be checked.");
      return { view: view.data === true, manage: manage.data === true };
    },
  });
}
