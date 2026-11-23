import { MetricCards } from "./_components/metric-cards";
import { PerformanceOverview } from "./_components/performance-overview";
import { SubscriberOverview } from "./_components/subscriber-overview";
import { WorkspaceHome } from "./_components/workspace-home";
import { BannerOverview } from "./_components/banner-overview";

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <WorkspaceHome />
      <MetricCards />
      <PerformanceOverview />
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <BannerOverview />
        <SubscriberOverview />
      </div>
    </div>
  );
}

