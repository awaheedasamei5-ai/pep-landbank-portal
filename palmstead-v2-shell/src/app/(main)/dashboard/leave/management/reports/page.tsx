import { LeaveReportsScreen } from "@/webnext/features/leave/reports/LeaveReportsScreen";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <LeaveReportsScreen
      management
      view={typeof params.view === "string" ? params.view : "overview"}
      queryParams={params}
    />
  );
}
