import { PlotInventoryScreen } from "@/webnext/features/plots/screens/PlotInventoryScreen";
import { OutletProvider } from "@/webnext-shim/react-router";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <OutletProvider value={children}>
      <PlotInventoryScreen />
    </OutletProvider>
  );
}
