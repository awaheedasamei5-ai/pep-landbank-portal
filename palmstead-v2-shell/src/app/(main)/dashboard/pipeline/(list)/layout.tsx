import { PipelineListScreen } from "@/webnext/features/pipeline/screens/PipelineListScreen";
import { OutletProvider } from "@/webnext-shim/react-router";

// Real web-next PipelineListScreen, copied verbatim, renders <Outlet/>
// internally for its nested :id child (Master Pipeline's own real
// "list stays mounted behind the detail drawer" behavior) -- this route
// group layout supplies that child via OutletProvider instead of
// react-router's route tree. See src/webnext-shim/react-router.tsx.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <OutletProvider value={children}>
      <PipelineListScreen />
    </OutletProvider>
  );
}
