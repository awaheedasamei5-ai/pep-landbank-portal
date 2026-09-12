"use client";

import Link from "next/link";

import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { useAuthStore } from "@/stores/auth/auth-store";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.values.sidebar_variant,
      sidebarCollapsible: s.values.sidebar_collapsible,
      isSynced: s.isSynced,
    })),
  );
  // Real user ask (2026-09-11): "the staff version of the pipeline is my
  // pipeline and not master pipeline, master pipeline is only for
  // management." Same route for both (see PipelineListScreen's own
  // comment on the real bug this closes) -- only the sidebar LABEL
  // itself needs to differ by role, not a second nav item or route.
  const isManager = useAuthStore((s) => s.profile?.role === "manager");
  const items = isManager
    ? sidebarItems
    : sidebarItems.map((group) =>
        group.items.some((item) => item.id === "master-pipeline")
          ? { ...group, items: group.items.map((item) => (item.id === "master-pipeline" ? { ...item, title: "My Pipeline" } : item)) }
          : group,
      );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="h-auto py-2">
              <Link prefetch={false} href="/dashboard/default">
                {/* Real user ask (2026-09-11): replace the logo + app-name
                    text with the black wordmark PNG (transparent bg),
                    centered at the top of the sidebar -- the wordmark
                    already carries the name, so the separate <span> text
                    is dropped rather than duplicated. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- small fixed-size sidebar mark, next/image's optimizer is overkill here */}
                <img src="/logo-black.png" alt={APP_CONFIG.name} className="mx-auto h-6 w-auto object-contain dark:invert" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
