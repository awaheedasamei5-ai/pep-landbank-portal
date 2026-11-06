"use client";

import { useSessionStore } from "@/webnext/auth/useSessionStore";
import { SalesReportScreen } from "@/webnext/shared/ui/SalesReportScreen";

export default function PipelineReportsPage() {
  const profile = useSessionStore((state) => state.profile);
  return <SalesReportScreen scope={profile?.role === "manager" ? "master" : "mine"} />;
}
