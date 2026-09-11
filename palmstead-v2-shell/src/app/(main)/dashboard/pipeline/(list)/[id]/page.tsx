import { PipelineDetailScreen } from "@/webnext/features/pipeline/screens/PipelineDetailScreen";

// Renders as the parent (list) layout's `children`, which OutletProvider
// then supplies to PipelineListScreen's own <Outlet/> -- the real
// web-next nested-route drawer behavior. useParams() inside
// PipelineDetailScreen reads `id` via the shim (backed by Next's own
// dynamic segment), unedited.
export default function Page() {
  return <PipelineDetailScreen />;
}
