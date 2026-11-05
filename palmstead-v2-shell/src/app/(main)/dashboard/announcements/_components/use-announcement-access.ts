"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";

export function useAnnouncementAccess(staffKey: string | undefined) {
  return useQuery({
    queryKey: ["announcementAccess", staffKey],
    enabled: Boolean(staffKey),
    refetchInterval: 15_000,
    queryFn: async () => {
      const client = requireSupabase();
      const [view, comment] = await Promise.all([
        client.rpc("has_permission", { p_key: "announcements.view" }),
        client.rpc("has_permission", { p_key: "announcements.comment" }),
      ]);
      if (view.error || comment.error) throw new Error("Announcement access could not be checked.");
      return { view: view.data === true, comment: comment.data === true };
    },
  });
}
