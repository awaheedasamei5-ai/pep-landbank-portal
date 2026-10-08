import { LeaveDashboardScreen } from "@/webnext/features/leave/screens/LeaveDashboardScreen";

// 2026-10-08, second correction: the single-scrolling-screen LeaveScreen
// (ring + calendar + flat list all stacked together) was rejected outright
// -- "no generic tiles or one page bullshit u call an app." This is now a
// real multi-page app (docs/plans/04-leave-full-app-build-plan.md):
// /dashboard/leave is the real dashboard/home page; My Requests, New
// Request, and Emergency Leave are their own routes under this folder.
// LeaveScreen.tsx stays in the repo (its logic was extracted into shared
// components, not discarded) but is no longer routed.
export default function Page() {
  return <LeaveDashboardScreen />;
}
