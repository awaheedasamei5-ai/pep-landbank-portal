"use client";

import Link from "next/link";

import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
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
      <SidebarHeader className="p-3">
        {/* Real user ask (2026-09-11 & 2026-09-12): replace the logo +
            app-name text with the user's own black wordmark PNG
            (palmstead logos.pdf, extracted losslessly, not a redesign),
            filling the header width nicely instead of a tiny mark lost
            in a lot of dead space -- the wordmark already carries the
            name, so the separate app-name text is dropped. A plain
            Link, not a SidebarMenuButton, since this isn't a nav item
            with an icon+label row -- that component's own sizing is
            what was squeezing the logo down to a sliver in the middle. */}
        <Link prefetch={false} href="/dashboard/default" className="flex items-center justify-center rounded-md px-2 py-2 hover:bg-sidebar-accent">
          {/* eslint-disable-next-line @next/next/no-img-element -- small fixed-size sidebar mark, next/image's optimizer is overkill here */}
          <img src="/logo-black.png" alt={APP_CONFIG.name} className="h-auto w-full max-w-[168px] object-contain dark:invert" />
        </Link>
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
