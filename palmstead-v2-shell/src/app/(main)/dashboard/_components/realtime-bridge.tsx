"use client";

import { useDashboardRealtime } from "@/webnext/features/dashboard/hooks/useDashboardRealtime";

// Real user request: an allocation edited/deleted/changed (or a lead,
// payment, complaint, enquiry, referral, contract, memo...) on one
// device/session should reflect everywhere else in the system live, not
// just in whichever screen happens to "own" that data. Mounted once here
// (the one real layout every authenticated page shares) rather than per
// screen, same reasoning web-next's own AppShell.tsx already documents --
// a change must update a screen that isn't even the one currently open.
export function RealtimeBridge() {
  useDashboardRealtime();
  return null;
}
