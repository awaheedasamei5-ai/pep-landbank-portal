import { PerformanceOverview } from "./_components/performance-overview";
import { SubscriberOverview } from "./_components/subscriber-overview";
import { WorkspaceHome } from "./_components/workspace-home";
import { BannerOverview } from "./_components/banner-overview";
import { DashboardActivity } from "./_components/dashboard-activity";

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <WorkspaceHome />
      <PerformanceOverview />
      <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-3">
        <BannerOverview />
        <SubscriberOverview />
      </div>
      <DashboardActivity />
    </div>
  );
}

