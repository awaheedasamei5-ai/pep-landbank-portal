import { AppViewGate } from "@/lib/permissions/app-view-gate";

export default function AnnouncementsLayout({ children }: { children: React.ReactNode }) {
  return <AppViewGate permission="announcements.view" label="Announcements">{children}</AppViewGate>;
}

