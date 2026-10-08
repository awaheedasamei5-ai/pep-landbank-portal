import { LeaveScreen } from "@/webnext/features/leave/screens/LeaveScreen";

// 2026-10-08: reverted from the OpenHRApp-duplicate composition
// (LeavePageClient) back to the real, already-built Leave screen --
// explicit user correction: the OpenHR version didn't match the real
// company requirements (confirmed-used-only deduction shown as a
// distinct number, a real leave planner/calendar, emergency leave as its
// own flow rather than a fake "type", reschedule that doesn't free days,
// no Guidelines clutter, no floating buttons). See
// docs/plans/.. and memory project-attendance-leave-v2-spec for the full
// spec this screen was originally built against. LeavePageClient.tsx /
// src/openhr/pages/Leave.tsx are kept in the repo, not deleted, but are
// no longer routed here.
export default function Page() {
  return <LeaveScreen />;
}
