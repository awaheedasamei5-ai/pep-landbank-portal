import { LeaveReminderReportScreen } from "@/webnext/features/leave/reports/LeaveReminderReportScreen";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <LeaveReminderReportScreen queryParams={await searchParams} />;
}
