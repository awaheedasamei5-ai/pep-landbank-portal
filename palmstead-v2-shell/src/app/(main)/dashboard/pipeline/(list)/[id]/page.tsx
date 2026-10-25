import { PipelineClientScreen } from "@/webnext/features/pipeline/screens/PipelineClientScreen";

// docs/plans/29-company-leads-full-system-blueprint.md -- My/Master
// Pipeline's own layered client page (Overview/Payment History/Site
// Visits & Allocation/Contract of Sale tabs), replacing the generic
// single-scroll PipelineDetailScreen for this route. Renders as the
// parent (list) layout's `children`, which OutletProvider then supplies
// to PipelineListScreen's own <Outlet/> -- the real web-next nested-route
// drawer behavior. useParams() inside LeadClientScreen reads `id` via the
// shim (backed by Next's own dynamic segment), unedited.
export default function Page() {
  return <PipelineClientScreen />;
}
