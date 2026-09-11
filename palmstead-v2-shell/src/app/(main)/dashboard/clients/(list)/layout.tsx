import { ClientDatabaseScreen } from "@/webnext/features/clients/screens/ClientDatabaseScreen";
import { OutletProvider } from "@/webnext-shim/react-router";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <OutletProvider value={children}>
      <ClientDatabaseScreen />
    </OutletProvider>
  );
}
