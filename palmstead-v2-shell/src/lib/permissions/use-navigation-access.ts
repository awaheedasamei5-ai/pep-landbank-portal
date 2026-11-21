"use client";

import { useQuery } from "@tanstack/react-query";

import { requireSupabase } from "@/lib/supabase.client";
import type { NavGroup } from "@/navigation/sidebar/sidebar-items";

const permissionKeys = [
  "company_leads.view",
  "announcements.view",
  "memorandum.view",
  "notes.view",
  "operations.todos.view",
  "operations.projects.view",
  "operations.meetings.view",
] as const;

export type NavigationPermission = (typeof permissionKeys)[number];
export type NavigationAccess = Record<NavigationPermission, boolean>;

const itemPermissions: Record<string, readonly NavigationPermission[]> = {
  "company-leads": ["company_leads.view"],
  announcements: ["announcements.view"],
  memorandum: ["memorandum.view"],
  notes: ["notes.view"],
  "operations-tracker": ["operations.todos.view", "operations.projects.view", "operations.meetings.view"],
};

export function canOpenNavigationItem(id: string, access: NavigationAccess | undefined, isManager: boolean) {
  if (isManager) return true;
  const required = itemPermissions[id];
  if (!required) return true;
  return required.some((key) => access?.[key] === true);
}

export function filterNavigation(groups: readonly NavGroup[], access: NavigationAccess | undefined, isManager: boolean) {
  return groups
    .filter((group) => isManager || group.label !== "Management")
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => canOpenNavigationItem(item.id, access, isManager))
        .map((item) =>
          !isManager && item.id === "master-pipeline" ? { ...item, title: "My Pipeline" } : item,
        ),
    }))
    .filter((group) => group.items.length > 0);
}

export function useNavigationAccess(staffKey: string | undefined, isManager: boolean) {
  return useQuery({
    queryKey: ["navigationAccess", staffKey, isManager],
    enabled: Boolean(staffKey) && !isManager,
    refetchInterval: 15_000,
    queryFn: async (): Promise<NavigationAccess> => {
      const client = requireSupabase();
      const results = await Promise.all(permissionKeys.map((p_key) => client.rpc("has_permission", { p_key })));
      const failed = results.find((result) => result.error);
      if (failed?.error) throw new Error("App access could not be checked.");
      return Object.fromEntries(permissionKeys.map((key, index) => [key, results[index].data === true])) as NavigationAccess;
    },
  });
}

