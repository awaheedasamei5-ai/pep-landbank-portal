import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeaveEmergencyForm } from "@/webnext/features/leave/components/LeaveEmergencyForm";

export default function Page() {
  return (
    <div className="p-4 pb-24 md:p-8">
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
