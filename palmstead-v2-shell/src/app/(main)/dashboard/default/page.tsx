import { PerformanceOverview } from "./_components/performance-overview";
import { SubscriberOverview } from "./_components/subscriber-overview";
import { WorkspaceHome } from "./_components/workspace-home";
import { BannerOverview } from "./_components/banner-overview";

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <WorkspaceHome />
      <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2">
        <SubscriberOverview />
        <BannerOverview />
      </div>
      <PerformanceOverview />
    </div>
  );
}


