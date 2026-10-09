import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { LeaveNewRequestForm } from "@/webnext/features/leave/components/LeaveNewRequestForm";

export default function Page() {
  return (
    <div className="p-4 pb-24 md:p-8">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/dashboard/leave">
          <ArrowLeft />
          Dashboard
        </Link>
      </Button>
      <PageHeader title="Request leave" />
      <LeaveNewRequestForm />
    </div>
  );
}
