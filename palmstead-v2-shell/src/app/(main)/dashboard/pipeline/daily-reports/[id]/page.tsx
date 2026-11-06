"use client";
import { useParams } from "next/navigation";

import { SalesDailyDigestScreen } from "@/webnext/shared/ui/SalesDailyDigestScreen";
export default function DailySalesReportPage() {
  const params = useParams<{ id: string }>();
  return <SalesDailyDigestScreen runId={params.id} />;
}
