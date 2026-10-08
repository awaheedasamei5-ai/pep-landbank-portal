import Link from "next/link";
import { LeaveEmergencyForm } from "@/webnext/features/leave/components/LeaveEmergencyForm";

export default function Page() {
  return (
    <div className="px-4 pt-5 pb-24 md:px-8 md:pt-7">
      <Link href="/dashboard/leave" className="mb-3 inline-block text-xs font-bold text-[var(--c-accent)] no-underline">
        ← Dashboard
      </Link>
      <h1 className="mb-4 text-xl font-bold">🚨 Emergency leave</h1>
      <LeaveEmergencyForm />
    </div>
  );
}
