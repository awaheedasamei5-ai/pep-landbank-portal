import { PipelineDetailScreen } from "@/webnext/features/pipeline/screens/PipelineDetailScreen";

// Company Leads' own detail drill-down shares the real PipelineDetailScreen
// (same lead entity) -- matches web-next's own route wiring exactly.
export default function Page() {
  return <PipelineDetailScreen />;
}
