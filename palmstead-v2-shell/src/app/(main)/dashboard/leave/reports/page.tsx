import { LeaveReportsScreen } from "@/webnext/features/leave/reports/LeaveReportsScreen";

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <LeaveReportsScreen view={view} />;
}
