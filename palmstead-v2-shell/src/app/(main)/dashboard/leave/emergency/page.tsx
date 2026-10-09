import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeaveEmergencyForm } from "@/webnext/features/leave/components/LeaveEmergencyForm";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/dashboard/leave">
          <ArrowLeft />
          Dashboard
        </Link>
      </Button>
      <LeaveEmergencyForm />
    </div>
  );
}
