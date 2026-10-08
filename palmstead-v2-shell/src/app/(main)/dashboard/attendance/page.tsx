import { AttendanceScreen } from "@/webnext/features/attendance/screens/AttendanceScreen";

// 2026-10-08: reverted from the OpenHRApp-duplicate composition
// (AttendancePageClient) back to the real, already-built Attendance
// screen -- explicit user correction: Check In/Out must be the primary,
// prominent element (a real circular clock button), not buried behind a
// floating corner toggle, plus real punctuality/hours charts, a compact
// history list, and no floating buttons blocking content while
// scrolling. AttendancePageClient.tsx / src/openhr/pages/Attendance.tsx
// are kept in the repo, not deleted, but are no longer routed here.
export default function Page() {
  return <AttendanceScreen />;
}
