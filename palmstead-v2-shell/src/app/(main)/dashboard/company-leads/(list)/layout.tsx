import { CompanyLeadsScreen } from "@/webnext/features/company-leads/screens/CompanyLeadsScreen";
import { OutletProvider } from "@/webnext-shim/react-router";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <OutletProvider value={children}>
      <CompanyLeadsScreen />
    </OutletProvider>
  );
}
