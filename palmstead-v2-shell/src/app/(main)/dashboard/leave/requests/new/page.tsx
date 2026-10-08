import Link from "next/link";
import { LeaveNewRequestForm } from "@/webnext/features/leave/components/LeaveNewRequestForm";

export default function Page() {
  return (
    <div className="px-4 pt-5 pb-24 md:px-8 md:pt-7">
      <Link href="/dashboard/leave" className="mb-3 inline-block text-xs font-bold text-[var(--c-accent)] no-underline">
        ← Dashboard
      </Link>
      <h1 className="mb-4 text-xl font-bold">Request leave</h1>
      <LeaveNewRequestForm />
    </div>
  );
}
