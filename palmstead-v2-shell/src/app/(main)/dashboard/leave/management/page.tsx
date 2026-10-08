import Link from "next/link";
import { LeaveManagementScreen } from "@/webnext/features/leave/screens/LeaveManagementScreen";

// Its own real route now (was a toggle-state view inside LeaveScreen.tsx)
// -- Management gets a genuinely separate URL, not a client-state switch
// on the staff page.
export default function Page() {
  return (
    <div>
      <div className="px-4 pt-5 md:px-8 md:pt-7">
        <Link href="/dashboard/leave" className="inline-block text-xs font-bold text-[var(--c-accent)] no-underline">
          ← My Leave
        </Link>
      </div>
      <LeaveManagementScreen />
    </div>
  );
}
