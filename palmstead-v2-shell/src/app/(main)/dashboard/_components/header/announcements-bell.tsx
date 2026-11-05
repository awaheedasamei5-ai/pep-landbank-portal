"use client";

import Link from "next/link";

import { Bell } from "lucide-react";

import { useAnnouncementAccess } from "@/app/(main)/dashboard/announcements/_components/use-announcement-access";
import { useAnnouncements } from "@/app/(main)/dashboard/announcements/_components/use-announcements";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth/auth-store";

// Real bell/badge unread indicator (OSS item 2, B.2) -- same real pattern
// V1's bubble had (unread count visible at a glance), pointed at the real
// Announcements page instead of a dismiss-only overlay.
export function AnnouncementsBell() {
  const profile = useAuthStore((s) => s.profile);
  const access = useAnnouncementAccess(profile?.key);
  const canView = !access.isError && access.data?.view === true;
  const { data } = useAnnouncements(canView ? profile?.key : undefined);
  const unreadCount = (data ?? []).filter((a) => !a.isRead).length;

  if (!canView) return null;

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href="/dashboard/announcements">
        <Bell />
        {unreadCount > 0 && (
          <span className="-top-0.5 -right-0.5 absolute flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Link>
    </Button>
  );
}
